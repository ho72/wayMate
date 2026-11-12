let state = null,
  busy = false,
  pending = JSON.parse(
    localStorage.getItem("waymate.operator.pending.v4") || "null",
  ),
  resetPending = JSON.parse(
    localStorage.getItem("waymate.operator.reset.v4") || "null",
  ),
  last = "",
  offline = false;
const status = (t) => (document.getElementById("status").textContent = t);
async function request(path, body) {
  const r = await fetch(path, {
    headers: {
      "X-Demo-Actor": "operator",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const j = await r.json();
  if (!r.ok) {
    if (body && r.status <= 500) {
      if (body.commandId === pending?.commandId) clear();
      if (body.commandId === resetPending?.commandId) clearReset();
    }
    throw new Error(j.error?.message || "서버 오류");
  }
  return j;
}
function clear() {
  pending = null;
  localStorage.removeItem("waymate.operator.pending.v4");
}
function clearReset() {
  resetPending = null;
  localStorage.removeItem("waymate.operator.reset.v4");
}
async function poll() {
  if (busy || document.hidden) return;
  busy = true;
  try {
    if (resetPending) {
      const r = await request(
        `/api/commands/${resetPending.commandId}?runId=${resetPending.runId}`,
      );
      if (r.status === "applied") clearReset();
    }
    if (pending) {
      const r = await request(
        `/api/commands/${pending.commandId}?runId=${pending.runId}`,
      );
      if (r.status === "applied") clear();
      else {
        status(
          "이전 응답 결과 미확인 · 같은 요청 다시 전송으로 확인해 주세요.",
        );
      }
    }
    state = await request("/api/state?view=operator");
    if (
      pending &&
      (state.reset?.runId === pending.runId ||
        (pending.runId !== state.runId &&
          state.completedRunIds?.includes(pending.runId)))
    )
      clear();
    if (
      resetPending &&
      resetPending.runId !== state.runId &&
      state.completedRunIds?.includes(resetPending.runId)
    )
      clearReset();
    if (state.schemaVersion !== 4) throw new Error("v4 서버가 필요해요.");
    if (offline && !pending) status("서버에 다시 연결됐어요.");
    offline = false;
    render();
  } catch (e) {
    offline = true;
    status(e.message);
  } finally {
    busy = false;
  }
}
function el(t, v) {
  const e = document.createElement(t);
  if (v) e.textContent = v;
  return e;
}
function render() {
  const resetButton = document.getElementById("begin-reset");
  if (resetButton) {
    document.getElementById("run-meta").textContent =
      `회차 ${state.runSeq} · ${state.runId}`;
    document.getElementById("reset-summary").textContent =
      state.recovery?.message ||
      (state.reset
        ? state.reset.blockedReasons.join(" · ") ||
          "초기화 완료를 확인하고 있어요."
        : state.lastCompletedReset
          ? "이전 회차 정리 완료 · 새 회차를 준비할 수 있어요."
          : "현재 회차 진행 중");
    resetButton.disabled =
      !!resetPending || !!state.reset || !state.actionBindings?.RESET_BEGIN;
  }
  const retryReset = document.getElementById("retry-reset");
  if (retryReset) retryReset.hidden = !resetPending;
  const key = JSON.stringify([
    state.journey,
    state.actionBindings,
    state.social,
    pending,
    resetPending,
    state.reset,
    state.recovery,
    state.runId,
  ]);
  if (key === last) return;
  last = key;
  renderJourney();
  const root = document.getElementById("requests");
  root.replaceChildren();
  for (const t of state.social.pendingResponses) {
    const card = el("section");
    card.className = "card";
    card.append(
      el(
        "h2",
        t.kind === "message"
          ? "B 메시지 답변"
          : t.kind === "connection"
            ? "B 대화 연결 응답"
            : "B 만남 제안 응답",
      ),
    );
    card.append(
      el(
        "p",
        t.kind === "message"
          ? "현재 메시지에 대응하는 준비된 답장·후속 질문을 보냅니다. 만남 동의와 구분해요."
          : t.kind === "meeting"
            ? "바다쉼표 카페 · 14:15~14:35 · 현재 제안에만 응답"
            : "모바일 연결 요청 · 차량 접속 없이 응답 가능",
      ),
    );
    for (const decision of t.kind === "message"
      ? ["reply"]
      : t.kind === "meeting" && state.social.meeting.status === "confirmed"
        ? ["cancel"]
        : ["accept", "reject"]) {
      const b = el(
        "button",
        {
          reply: "B 메시지 답변",
          accept: "B 수락",
          reject: "B 거절",
          cancel: "B 만남 취소",
        }[decision],
      );
      b.disabled =
        !!pending || !!resetPending || !!state.reset || !!state.recovery;
      b.onclick = () => send(t, decision);
      card.append(b);
    }
    root.append(card);
  }
  if (!state.social.pendingResponses.length)
    root.append(el("p", "현재 응답을 기다리는 요청이 없어요."));
  if (pending) {
    const b = el("button", "같은 요청 다시 전송");
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      try {
        await request("/api/commands", pending);
        clear();
        status("응답 저장을 확인했어요.");
      } catch (e) {
        status(e.message);
      } finally {
        busy = false;
        poll();
      }
    };
    root.append(b);
  }
}
async function send(target, decision) {
  return sendCommand("B_RESPONSE", { decision }, target);
}
async function sendCommand(type, payload, target, reviewedRun = null) {
  const resetting = type === "RESET_BEGIN";
  if (busy || (resetting ? resetPending : pending || resetPending)) return;
  busy = true;
  try {
    const s = await request("/api/state?view=operator");
    if (reviewedRun && reviewedRun !== s.runId)
      throw new Error("회차가 바뀌었어요. 초기화 범위를 다시 확인해 주세요.");
    const command = {
      schemaVersion: 4,
      runId: s.runId,
      runSeq: s.runSeq,
      expectedVersion: s.version,
      commandId: crypto.randomUUID(),
      actor: "operator",
      type,
      target,
      payload,
    };
    if (resetting) resetPending = command;
    else pending = command;
    localStorage.setItem(
      resetting ? "waymate.operator.reset.v4" : "waymate.operator.pending.v4",
      JSON.stringify(command),
    );
    await request("/api/commands", command);
    if (resetting) clearReset();
    else clear();
    status(
      type === "RESET_BEGIN"
        ? "초기화를 시작했어요. 내비 정리와 ACK를 기다려 주세요."
        : type === "B_RESPONSE"
          ? "B 응답을 저장했어요."
          : type === "MEETING_START"
            ? "14:15 만남 재연을 시작했어요."
            : type === "MEETING_END"
              ? "만남을 마치고 양쪽 최종 선택을 함께 열었어요."
              : type === "REPLAY_FINAL"
                ? "새 최종 선택 회차를 열었어요. 양쪽이 독립적으로 선택해 주세요."
                : "이야기 배경을 반영했어요.",
    );
  } catch (e) {
    status(e.message);
  } finally {
    busy = false;
    poll();
  }
}
let resetReview = null;
const resetButton = document.getElementById("begin-reset");
if (resetButton) {
  resetButton.onclick = () => {
    if (busy || resetPending || !state?.actionBindings?.RESET_BEGIN) return;
    resetReview = {
      runId: state.runId,
      binding: structuredClone(state.actionBindings.RESET_BEGIN),
    };
    document.getElementById("reset-dialog").showModal();
  };
  document.getElementById("retry-reset").onclick = async () => {
    if (busy || !resetPending) return;
    busy = true;
    try {
      await request("/api/commands", resetPending);
      clearReset();
    } catch (e) {
      status(e.message);
    } finally {
      busy = false;
      poll();
    }
  };
  document.getElementById("cancel-reset").onclick = () => {
    resetReview = null;
    document.getElementById("reset-dialog").close();
  };
  document.getElementById("confirm-reset").onclick = () => {
    if (busy) {
      status("서버 상태를 확인 중이에요. 잠시 뒤 다시 확인해 주세요.");
      return;
    }
    const r = resetReview;
    resetReview = null;
    document.getElementById("reset-dialog").close();
    if (r)
      sendCommand(
        r.binding.commandType,
        r.binding.payload,
        r.binding.target,
        r.runId,
      );
  };
}
await poll();
setInterval(poll, 500);

function renderJourney() {
  const root = document.getElementById("journey-controls");
  if (!root) return;
  root.replaceChildren();
  root.append(el("h2", "만남 재연·두 가지 여행"));
  const j = state.journey;
  root.append(
    el(
      "p",
      j
        ? `현재 단계 ${j.phase} · ${j.replay ? "최종 선택 재시연" : "일반 진행"}`
        : "현재 회차 준비 중",
    ),
  );
  if (j?.final) {
    root.append(el("p", `선택 회차 ${j.final.round} · ${j.final.status}`));
    root.append(
      el(
        "p",
        j.final.myChoice
          ? `B 본인 선택: ${j.final.myChoice === "together" ? "함께" : "내 캐릭터와"}`
          : "B는 A 제출과 관계없이 독립적으로 선택할 수 있어요. 상대 선택은 공개하지 않아요.",
      ),
    );
  }
  if (j?.blockedReason) root.append(el("p", j.blockedReason));
  const labels = {
    MEETING_START: "만남 시작으로 이동",
    MEETING_END: "만남 종료",
    REPLAY_FINAL: "최종 선택 재시연",
    B_FINAL_TOGETHER: "B 함께 여행 이어가기",
    B_FINAL_MY_AGENT: "B 내 캐릭터와 여행 이어가기",
    SET_STORY_CONTEXT: j?.peerIntroSeen
      ? "B 사전 소개 배경 생략"
      : "B 사전 소개 배경 적용",
  };
  for (const [key, label] of Object.entries(labels)) {
    const binding = state.actionBindings?.[key];
    if (!binding) continue;
    const button = el("button", label);
    button.disabled =
      !!pending || !!resetPending || !!state.reset || !!state.recovery;
    button.onclick = () =>
      sendCommand(
        binding.commandType,
        binding.payload,
        binding.target,
        state.runId,
      );
    root.append(button);
  }
  root.append(
    el(
      "p",
      "시간 전환은 가상 만남 재연이에요. GPS 도착·실제 B 접속·새 내비 변경을 만들지 않아요.",
    ),
  );
}
