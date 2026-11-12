import { randomUUID } from "node:crypto";
import { fail } from "./handoff.mjs";
import { canSocial, linked, peer } from "./social.mjs";
import {
  QUESTIONS,
  MESSAGES,
  FOLLOWUP,
  REPLIES,
  UNKNOWN,
  REPLY_DONE,
  profileAnswer,
} from "../../shared/config/content-v4.mjs";
export const initialContent = () => ({ threads: [] });
const threads = (s) => s.content?.threads || [];
export const contentAvailable = (s) =>
  linked(s) &&
  s.journeyMode === "connected" &&
  !!s.vehicleActivation &&
  !["cancelled", "declined", "started", "ended"].includes(
    s.social.meeting.status,
  );
export function closeContent(s) {
  for (const t of threads(s))
    if (["waiting", "received"].includes(t.status)) t.status = "closed";
}
export function contentBindings(s, actor, now) {
  if (actor !== "car" || !contentAvailable(s) || !canSocial(s, now)) return {};
  const active = threads(s).find((t) =>
    ["waiting", "received"].includes(t.status),
  );
  const b = {};
  if (!active)
    for (const id of Object.keys(MESSAGES))
      b[`MESSAGE_SEND_${id}`] = {
        commandType: "MESSAGE_SEND",
        target: { connectionId: s.social.connection.id },
        payload: { messagePresetId: id },
      };
  if (active?.status === "received")
    for (const id of Object.keys(REPLIES))
      b[`MESSAGE_REPLY_${id}`] = {
        commandType: "MESSAGE_REPLY",
        target: {
          threadId: active.id,
          followupQuestionId: active.followupQuestionId,
        },
        payload: { replyPresetId: id },
      };
  return b;
}
export function applyContent(s, c, now) {
  const ts = threads(s),
    t = c.target,
    p = c.payload;
  if (c.actor !== (c.type === "B_RESPONSE" ? "operator" : "car"))
    fail(403, "ACTOR_FORBIDDEN", "차량에서 확인한 말만 전달할 수 있어요.");
  if (!contentAvailable(s))
    fail(409, "INVALID_TRANSITION", "현재 연결에서 이어갈 수 없는 대화예요.");
  if (!canSocial(s, now))
    fail(423, "RESTRICTED", "정차·활성 차량과 현재 내비 상태를 확인해 주세요.");
  if (c.type === "MESSAGE_SEND") {
    if (t.connectionId !== s.social.connection.id)
      fail(409, "STALE_STATE", "연결이 바뀌었어요.");
    if (ts.some((x) => ["waiting", "received"].includes(x.status)))
      fail(
        409,
        "INVALID_TRANSITION",
        "기존 답장과 후속 답변을 먼저 확인해 주세요.",
      );
    (s.content ??= initialContent()).threads.push({
      id: randomUUID(),
      requestId: randomUUID(),
      connectionId: t.connectionId,
      messagePresetId: p.messagePresetId,
      createdBy: c.commandId,
      status: "waiting",
      sentAt: new Date().toISOString(),
      responsePresetId: null,
      followupQuestionId: null,
      replyPresetId: null,
    });
    return;
  }
  const thread = ts.find((x) => x.id === t.threadId);
  if (!thread || thread.connectionId !== s.social.connection.id)
    fail(409, "STALE_STATE", "현재 연결의 메시지가 아니에요.");
  if (c.type === "B_RESPONSE") {
    if (
      thread.status !== "waiting" ||
      t.requestId !== thread.requestId ||
      t.connectionId !== thread.connectionId
    )
      fail(409, "STALE_STATE", "답변할 현재 메시지가 아니에요.");
    thread.responsePresetId = thread.messagePresetId;
    thread.followupQuestionId = FOLLOWUP.id;
    thread.status = "received";
  } else {
    if (
      thread.status !== "received" ||
      t.followupQuestionId !== thread.followupQuestionId
    )
      fail(
        409,
        "INVALID_TRANSITION",
        "현재 후속 질문에 한 번만 답변할 수 있어요.",
      );
    thread.replyPresetId = p.replyPresetId;
    thread.status = "replied";
  }
}
export function contentProjection(s, actor, now) {
  if (actor !== "car" || !contentAvailable(s)) return null;
  const ownInterests = s.social.approvedFields.includes("interests")
    ? s.profile.privateSummary.interests
    : [];
  return {
    connectionId: s.social.connection.id,
    peerAlias: peer.alias,
    profileVersion: peer.publicProfileVersion,
    questions: QUESTIONS.map((q) => ({
      ...q,
      answer: profileAnswer(q.id, peer, ownInterests),
      known: profileAnswer(q.id, peer, ownInterests) !== UNKNOWN,
    })),
    messages: Object.entries(MESSAGES).map(([id, m]) => ({ id, text: m.text })),
    replies: Object.entries(REPLIES).map(([id, text]) => ({ id, text })),
    threads: threads(s).map((t) => ({
      ...t,
      text: MESSAGES[t.messagePresetId].text,
      response: t.responsePresetId
        ? MESSAGES[t.responsePresetId].response
        : null,
      followup: t.followupQuestionId ? FOLLOWUP.text : null,
      reply: t.replyPresetId ? REPLIES[t.replyPresetId] : null,
    })),
    replyDone: REPLY_DONE,
    canInteract: canSocial(s, now),
  };
}
export function messageResponses(s, actor, now) {
  return actor === "operator" && contentAvailable(s)
    ? threads(s)
        .filter((t) => t.status === "waiting")
        .map((t) => ({
          kind: "message",
          connectionId: t.connectionId,
          requestId: t.requestId,
          threadId: t.id,
        }))
    : [];
}
export function validateContent(s) {
  const ids = new Set(),
    requests = new Set();
  let active = 0;
  for (const t of threads(s)) {
    if (
      ids.has(t.id) ||
      requests.has(t.requestId) ||
      t.connectionId !== s.social.connection.id ||
      !MESSAGES[t.messagePresetId]
    )
      throw Error("잘못된 메시지 식별자/연결");
    ids.add(t.id);
    requests.add(t.requestId);
    if (["waiting", "received"].includes(t.status)) {
      active++;
      if (!contentAvailable(s)) throw Error("종료된 상대의 활성 메시지");
    }
    if (
      t.status === "waiting" &&
      (t.responsePresetId || t.followupQuestionId || t.replyPresetId)
    )
      throw Error("미발생 답장/후속 질문");
    if (
      t.responsePresetId &&
      (t.responsePresetId !== t.messagePresetId ||
        t.followupQuestionId !== FOLLOWUP.id)
    )
      throw Error("메시지별 대본 불일치");
    if (["received", "replied"].includes(t.status) && !t.responsePresetId)
      throw Error("답장 없는 후속 대화");
    if ((t.status === "replied") !== !!t.replyPresetId)
      throw Error("후속 답변 상태 불일치");
  }
  if (active > 1) throw Error("여러 활성 메시지 요청");
}
