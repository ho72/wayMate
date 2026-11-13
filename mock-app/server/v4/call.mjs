import { randomUUID } from "node:crypto";
import { fail } from "./handoff.mjs";
import { contentAvailable } from "./content.mjs";
import { canSocial, peer } from "./social.mjs";
import { profileAnswer, UNKNOWN } from "../../shared/config/content-v4.mjs";
import { GENERAL_CALL, FAMILIAR_CALL } from "../../shared/config/call-v4.mjs";

export const callTypes = new Set(["CALL_PROPOSE", "CALL_CANCEL", "CALL_END"]);
export const callBusy = (s) => ["requested", "active"].includes(s.call?.status);
const bind = (commandType, target, payload = {}) => ({
  commandType,
  target,
  payload,
});
const ready = (s, now) =>
  contentAvailable(s) && canSocial(s, now) && !s.reset && !s.recovery;
const familiar = (s) => {
  const q = s.storyContext?.cue;
  return (
    q?.cueId === "S06_Q1_ANSWER" &&
    q.runId === s.runId &&
    q.connectionId === s.social.connection.id &&
    q.peerPublicProfileVersion === peer.publicProfileVersion &&
    profileAnswer("Q1", peer) !== UNKNOWN
  );
};
export function closeCall(s) {
  if (callBusy(s)) s.call.status = "ended";
}
export function callBindings(s, actor, now) {
  if (actor !== "car") return {};
  const out = {},
    c = s.call;
  if (ready(s, now) && s.social.meeting.status === "none" && !callBusy(s))
    out.CALL_PROPOSE = bind(
      "CALL_PROPOSE",
      { connectionId: s.social.connection.id },
      { requestedMode: "plain" },
    );
  if (s.vehicleActivation && callBusy(s)) {
    if (c.status === "requested")
      out.CALL_CANCEL = bind("CALL_CANCEL", {
        callId: c.id,
        requestId: c.requestId,
      });
    out.CALL_END = bind("CALL_END", { callId: c.id });
  }
  return out;
}
export function applyCall(s, c, now) {
  const p = c.payload,
    t = c.target,
    current = s.call;
  if (c.actor !== (c.type === "B_RESPONSE" ? "operator" : "car"))
    fail(403, "ACTOR_FORBIDDEN", "현재 통화의 당사자 동의가 필요해요.");
  if (c.type === "CALL_PROPOSE") {
    if (!callBindings(s, "car", now).CALL_PROPOSE)
      fail(
        423,
        "RESTRICTED",
        "정차·연결 상태와 진행 중인 통화를 확인해 주세요.",
      );
    if (t.connectionId !== s.social.connection.id)
      fail(409, "STALE_STATE", "연결이 바뀌었어요.");
    s.call = {
      id: randomUUID(),
      requestId: randomUUID(),
      connectionId: t.connectionId,
      createdBy: c.commandId,
      status: "requested",
      aConsent: true,
      bConsent: false,
      sample: familiar(s) ? "familiar" : "general",
    };
    return;
  }
  if (
    !current ||
    t.callId !== current.id ||
    current.connectionId !== s.social.connection.id
  )
    fail(409, "STALE_STATE", "현재 통화 요청이 아니에요.");
  if (c.type === "B_RESPONSE") {
    if (
      current.status !== "requested" ||
      t.requestId !== current.requestId ||
      t.connectionId !== current.connectionId
    )
      fail(409, "STALE_STATE", "이미 종료했거나 다른 통화의 동의예요.");
    if (p.decision === "accept" && !ready(s, now))
      fail(423, "RESTRICTED", "정차·활성 차량에서만 통화를 시작할 수 있어요.");
    current.bConsent = p.decision === "accept";
    current.status = current.bConsent ? "active" : "declined";
  } else {
    const b = callBindings(s, "car", now)[c.type];
    if (!b || (c.type === "CALL_CANCEL" && t.requestId !== current.requestId))
      fail(409, "STALE_STATE", "취소·종료할 현재 통화가 아니에요.");
    current.status = c.type === "CALL_CANCEL" ? "cancelled" : "ended";
  }
}
export function callResponses(s, actor) {
  const c = s.call;
  return actor === "operator" &&
    c?.status === "requested" &&
    contentAvailable(s)
    ? [
        {
          kind: "call",
          callId: c.id,
          requestId: c.requestId,
          connectionId: c.connectionId,
        },
      ]
    : [];
}
export function callProjection(s, actor, now) {
  if (actor !== "car" || !s.call || !contentAvailable(s)) return null;
  const { id, requestId, connectionId, status, aConsent, bConsent, sample } =
    s.call;
  return {
    id,
    requestId,
    connectionId,
    status,
    aConsent,
    bConsent,
    source: "call_sample",
    canPlay: status === "active" && ready(s, now),
    lines:
      status === "active"
        ? sample === "familiar"
          ? FAMILIAR_CALL
          : GENERAL_CALL
        : [],
  };
}
export function validateCall(s) {
  const c = s.call;
  if (!c) return;
  if (
    c.connectionId !== s.social.connection.id ||
    !c.aConsent ||
    (c.status === "requested" && c.bConsent) ||
    (c.status === "active" && !c.bConsent) ||
    (callBusy(s) &&
      (!contentAvailable(s) || s.social.meeting.status !== "none"))
  )
    throw Error("통화 동의·연결·장면이 일치하지 않아요.");
}
