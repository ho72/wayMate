import { isDeepStrictEqual } from "node:util";
import { assertConsultation } from "./validation.mjs";
import { fail } from "./handoff.mjs";

export function consultationGuard(
  state,
  clientId,
  request,
  { replay = true } = {},
) {
  try {
    assertConsultation("request", request);
  } catch {
    fail(400, "INVALID_PAYLOAD", "상담 요청 형식을 확인해 주세요.");
  }
  if (!request.message.trim())
    fail(400, "INVALID_PAYLOAD", "이야기를 입력해 주세요.");
  if (state.clientId && state.clientId !== clientId)
    fail(403, "ACTOR_FORBIDDEN", "이 상담을 시작한 브라우저를 사용해 주세요.");
  if (request.runId !== state.runId)
    fail(409, "RUN_CHANGED", "새 회차에서 다시 이야기해 주세요.");
  if (state.reset || state.recovery)
    fail(423, "RESTRICTED", "초기화·복구 중에는 상담할 수 없어요.");
  const hit = state.consultation?.turns.find(
    (t) => t.requestId === request.requestId,
  );
  if (hit) {
    if (
      hit.message !== request.message ||
      request.expectedRevision !== state.consultation.turns.indexOf(hit)
    )
      fail(400, "COMMAND_ID_REUSED", "같은 메시지 ID의 내용을 바꿀 수 없어요.");
    if (replay) return hit;
  }
  if (
    state.vehicleActivation ||
    state.social.connection.attempted ||
    state.profile ||
    Object.keys(state.onboarding).length
  )
    fail(409, "NOT_READY", "상담은 새 여행의 소개 확인 전에 시작해 주세요.");
  if ((state.consultation?.revision || 0) !== request.expectedRevision)
    fail(409, "STALE_STATE", "최신 대화를 확인한 뒤 다시 이야기해 주세요.");
  if (request.expectedRevision >= 20)
    fail(409, "NOT_READY", "지금까지의 이야기로 소개를 확인해 주세요.");
  return null;
}

export function validateConsultationStore(s) {
  const c = s.consultation;
  if (!c && s.profile?.privateSummary.summarySource === "user_confirmed_ai")
    throw new Error("상담 기록 없는 AI 소개");
  if (!c) return;
  if (
    !s.clientId ||
    c.revision !== c.turns.length ||
    new Set(c.turns.map((t) => t.requestId)).size !== c.turns.length
  )
    throw new Error("상담 기록 순서 불일치");
  if (
    Object.keys(s.onboarding).length ||
    (s.profile &&
      s.profile.privateSummary.summarySource !== "user_confirmed_ai")
  )
    throw new Error("시연 답변과 AI 상담을 섞을 수 없습니다.");
  if (
    s.profile?.privateSummary.summarySource === "user_confirmed_ai" &&
    (s.profile.consultationRevision !== c.revision ||
      !s.profile.introduction?.trim())
  )
    throw new Error("확인한 AI 소개와 상담 버전 불일치");
}

/** External network work never holds the domain queue or expires a vehicle heartbeat. */
export function consultationService(api, provider, { timeoutMs = 25000 } = {}) {
  let pending = null,
    closing = false;
  return {
    available: !!provider,
    async turn(clientId, request) {
      if (closing) fail(503, "UNAVAILABLE", "서버가 종료 중이에요.");
      if (!provider)
        fail(
          503,
          "AI_NOT_CONFIGURED",
          "실제 AI 상담이 아직 연결되지 않았어요. 시연 대화는 계속 사용할 수 있어요.",
        );
      const context = await api.consultationContext(clientId, request);
      if (closing) fail(503, "UNAVAILABLE", "서버가 종료 중이에요.");
      if (context.replayed) return { replayed: true, state: context.state };
      if (pending) {
        if (
          pending.clientId === clientId &&
          isDeepStrictEqual(pending.request, request)
        )
          return pending.promise;
        fail(409, "AI_BUSY", "앞선 답변을 기다린 뒤 이어서 이야기해 주세요.");
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(timeoutMs),
      ]);
      const work = { clientId, request: structuredClone(request), controller };
      pending = work;
      work.promise = (async () => {
        const result = await provider.generate({
          turns: context.turns,
          message: request.message,
          signal,
        });
        if (closing || signal.aborted)
          fail(
            503,
            "AI_TIMEOUT",
            "AI 답변을 확인하지 못했어요. 다시 확인해 주세요.",
          );
        try {
          assertConsultation("draft", result);
        } catch {
          fail(503, "AI_INVALID_RESPONSE", "AI 응답 형식을 확인할 수 없어요.");
        }
        if (!result.reply.trim() || !result.introduction.trim())
          fail(503, "AI_INVALID_RESPONSE", "빈 AI 응답을 받았어요.");
        return api.consultationCommit(clientId, request, result);
      })().finally(() => {
        if (pending === work) pending = null;
      });
      return work.promise;
    },
    async close() {
      closing = true;
      if (pending) {
        pending.controller.abort();
        await Promise.allSettled([pending.promise]);
      }
    },
  };
}
