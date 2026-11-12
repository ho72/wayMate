import { randomUUID } from "node:crypto";
import { fail, parked } from "./handoff.mjs";
import { linked, unresolved, peer } from "./social.mjs";
import { closeContent } from "./content.mjs";
import { identity, validEvidence } from "./navigation.mjs";
import { profileAnswer, UNKNOWN } from "../../shared/config/content-v4.mjs";
import {
  GENERAL_MEETING,
  FAMILIAR_MEETING,
  TOGETHER_SCENE,
  OWN_QUESTIONS,
} from "../../shared/config/ending-v4.mjs";
export const initialStory = () => ({ peerIntroSeen: true, cue: null });
export const journeyTypes = new Set([
  "MEETING_START",
  "MEETING_END",
  "FINAL_CHOOSE",
  "REPLAY_FINAL",
  "SET_STORY_CONTEXT",
]);
export const vehicleReady = (s, now) =>
  !!s.vehicleActivation &&
  s.vehicleActivation.deviceId === s.vehicle.deviceId &&
  parked(s, now) &&
  !s.social.testRestricted &&
  !unresolved(s) &&
  !s.reset &&
  !s.recovery;
const replay = (s) => s.replayContext?.mode === "final_replay";
const checkpointValid = (s) =>
  s.finalCheckpoint?.runId === s.runId &&
  s.finalCheckpoint.proposalId === s.social.meeting.proposalId &&
  s.finalCheckpoint.storyConnectionId === s.social.meeting.connectionId &&
  s.social.meeting.status === "ended";
function navApplied(s) {
  const n = s.navigation,
    a = n?.attempts.find((a) => a.attemptId === n.owned?.attemptId);
  return !!(
    a &&
    a.context === "meeting" &&
    a.proposalId === s.social.meeting.proposalId &&
    a.outcome === "applied" &&
    a.operation === "add" &&
    a.deviceId === s.vehicle.deviceId
  );
}
function navReady(s, now) {
  const n = s.navigation,
    a = n?.attempts.find((a) => a.attemptId === n.owned?.attemptId),
    o = n?.observation;
  return !!(
    a &&
    a.context === "meeting" &&
    a.proposalId === s.social.meeting.proposalId &&
    a.outcome === "applied" &&
    a.operation === "add" &&
    a.deviceId === s.vehicle.deviceId &&
    o &&
    o.vehicleSessionId === s.vehicle.vehicleSessionId &&
    o.vehicleEpoch === s.vehicle.vehicleEpoch &&
    now >= o.receivedAt &&
    now - o.receivedAt < 2000 &&
    validEvidence(o.evidence) &&
    identity(o.evidence.second.destination, n.owned.destination) &&
    o.evidence.second.waypoints.length === 1 &&
    identity(o.evidence.second.waypoints[0], n.owned.waypoint)
  );
}
export function recordStoryCue(s, c, now) {
  const q = c.payload.displayedCue;
  if (
    !q ||
    q.runId !== s.runId ||
    q.connectionId !== s.social.connection.id ||
    q.peerPublicProfileVersion !== peer.publicProfileVersion ||
    !vehicleReady(s, now) ||
    !linked(s) ||
    profileAnswer("Q1", peer) === UNKNOWN
  )
    return;
  (s.storyContext ??= initialStory()).cue = structuredClone(q);
}
function familiar(s) {
  const q = s.storyContext?.cue;
  return !!(
    s.storyContext?.peerIntroSeen &&
    q?.runId === s.runId &&
    q.connectionId === s.social.connection.id &&
    q.peerPublicProfileVersion === peer.publicProfileVersion &&
    profileAnswer("Q1", peer) !== UNKNOWN &&
    s.social.approvedFields.includes("interests") &&
    ["sea_walk", "cafe"].every((x) =>
      s.profile.privateSummary.interests.includes(x),
    )
  );
}
function finalAllowed(s, now) {
  return (
    vehicleReady(s, now) &&
    checkpointValid(s) &&
    (replay(s) || (linked(s) && s.journeyMode === "connected"))
  );
}
const binding = (commandType, target, payload = {}) => ({
  commandType,
  target,
  payload,
});
const target = (f) => ({
  finalId: f.id,
  finalRound: f.round,
  requestId: f.issuedRequestId,
});
export function journeyBindings(s, actor, now) {
  const b = {},
    m = s.social.meeting,
    f = s.final;
  if (actor === "operator" && vehicleReady(s, now)) {
    if (!replay(s) && linked(s) && m.status === "confirmed") {
      if (navReady(s, now))
        b.MEETING_START = binding("MEETING_START", {
          proposalId: m.proposalId,
        });
      b.SET_STORY_CONTEXT = binding(
        "SET_STORY_CONTEXT",
        { proposalId: m.proposalId },
        { peerIntroSeen: !(s.storyContext ?? initialStory()).peerIntroSeen },
      );
    }
    if (!replay(s) && linked(s) && m.status === "started")
      b.MEETING_END = binding("MEETING_END", { proposalId: m.proposalId });
    if (checkpointValid(s) && ["together", "my_agent"].includes(f?.status))
      b.REPLAY_FINAL = binding("REPLAY_FINAL", {
        finalId: f.id,
        finalRound: f.round,
      });
  }
  if (f?.status === "pending" && finalAllowed(s, now)) {
    if (actor === "car" && f.aChoice === null)
      for (const choice of ["together", "my_agent"])
        b["FINAL_CHOOSE_" + choice.toUpperCase()] = binding(
          "FINAL_CHOOSE",
          target(f),
          { choice },
        );
    if (actor === "operator" && f.bChoice === null)
      for (const decision of ["together", "my_agent"])
        b["B_FINAL_" + decision.toUpperCase()] = binding(
          "B_RESPONSE",
          { kind: "final", ...target(f) },
          { decision },
        );
  }
  return b;
}
export function guardFinalReplay(s, c) {
  if (!replay(s)) return;
  if (
    [
      "FINAL_CHOOSE",
      "REPLAY_FINAL",
      "RESET_BEGIN",
      "RESET_ACK",
      "CAR_SESSION_OPEN",
      "CAR_STATUS",
      "NAV_OBSERVE",
      "NAV_REPORT",
      "NAV_CANCEL",
      "CONNECT_END",
      "CONNECT_CANCEL",
      "PROFILE_PRIVATE",
      "MEETING_CANCEL",
      "CANCEL_PENDING_COMMAND",
      "SET_TEST_RESTRICTION",
    ].includes(c.type) ||
    (c.type === "B_RESPONSE" && c.target.kind === "final")
  )
    return;
  if (c.type === "NAV_REMOVE_APPROVE" && c.payload.operation === "remove")
    return;
  if (
    c.type === "NAV_DISPATCH_BEGIN" &&
    s.navigation?.attempts.find((a) => a.attemptId === c.payload.attemptId)
      ?.operation === "remove"
  )
    return;
  fail(
    423,
    "REPLAY_ONLY",
    "최종 선택 재시연에서는 새 대화·만남·내비 추가를 열 수 없어요.",
  );
}
function openFinal(s) {
  s.finalRound = (s.finalRound ?? 0) + 1;
  const requestId = randomUUID();
  s.final = {
    id: randomUUID(),
    round: s.finalRound,
    requestId,
    issuedRequestId: requestId,
    aChoice: null,
    bChoice: null,
    status: "pending",
  };
}
export function interruptFinal(s) {
  if (!replay(s) && s.final?.status === "pending" && !linked(s)) {
    s.final.status = "cancelled";
    s.final.requestId = null;
  }
}
export function applyJourney(s, c, now) {
  const m = s.social.meeting,
    t = c.target,
    p = c.payload,
    f = s.final;
  const actor = c.type === "FINAL_CHOOSE" ? "car" : "operator";
  if (c.actor !== actor)
    fail(403, "ACTOR_FORBIDDEN", "현재 역할의 선택만 제출할 수 있어요.");
  if (["FINAL_CHOOSE", "B_RESPONSE"].includes(c.type)) {
    if (
      !f ||
      t.finalId !== f.id ||
      t.finalRound !== f.round ||
      t.requestId !== f.issuedRequestId
    )
      fail(409, "STALE_STATE", "현재 최종 선택 요청을 다시 확인해 주세요.");
    const key = c.type === "FINAL_CHOOSE" ? "aChoice" : "bChoice";
    if (f.status !== "pending" || f[key] !== null)
      fail(
        409,
        "INVALID_TRANSITION",
        "이번 선택은 이미 제출되었거나 종료됐어요.",
      );
    if (!finalAllowed(s, now))
      fail(423, "RESTRICTED", "현재 차량·연결·복구 상태를 확인해 주세요.");
    f[key] = c.type === "FINAL_CHOOSE" ? p.choice : p.decision;
    if (f.aChoice !== null && f.bChoice !== null) {
      f.status =
        f.aChoice === "together" && f.bChoice === "together"
          ? "together"
          : "my_agent";
      f.requestId = null;
      if (f.status === "my_agent" && s.social.connection.status === "linked") {
        s.social.connection.status = "ended";
        s.social.connection.version++;
        closeContent(s);
      }
    }
    return;
  }
  if (!vehicleReady(s, now))
    fail(
      423,
      "RESTRICTED",
      "정차·활성 차량과 미확정 내비 상태를 먼저 확인해 주세요.",
    );
  if (c.type === "REPLAY_FINAL") {
    if (!f || t.finalId !== f.id || t.finalRound !== f.round)
      fail(409, "STALE_STATE", "현재 결말을 다시 확인해 주세요.");
    if (!checkpointValid(s) || !["together", "my_agent"].includes(f.status))
      fail(
        409,
        "INVALID_TRANSITION",
        "완료한 만남과 확정된 결말에서만 재시연할 수 있어요.",
      );
    (s.finalHistory ??= []).push(structuredClone(f));
    s.replayContext = {
      mode: "final_replay",
      checkpointId: s.finalCheckpoint.id,
    };
    openFinal(s);
    return;
  }
  if (t.proposalId !== m.proposalId)
    fail(409, "STALE_STATE", "현재 만남을 다시 확인해 주세요.");
  if (replay(s) || !linked(s))
    fail(409, "INVALID_TRANSITION", "현재 연결에서 진행할 만남이 아니에요.");
  if (c.type === "SET_STORY_CONTEXT") {
    if (m.status !== "confirmed")
      fail(
        409,
        "INVALID_TRANSITION",
        "재연 시작 전에만 이야기 배경을 바꿀 수 있어요.",
      );
    (s.storyContext ??= initialStory()).peerIntroSeen = p.peerIntroSeen;
    return;
  }
  if (c.type === "MEETING_START") {
    if (
      m.status !== "confirmed" ||
      !m.aConsent ||
      !m.bConsent ||
      !navReady(s, now)
    )
      fail(
        409,
        "NOT_READY",
        "현재 만남의 동의·운전자 승인·실제 경유지 반영 확인이 필요해요.",
      );
    closeContent(s);
    m.status = "started";
    m.reenactment = {
      variant: familiar(s) ? "familiar" : "general",
      startedAt: new Date().toISOString(),
    };
    return;
  }
  if (m.status !== "started" || s.finalCheckpoint || f)
    fail(
      409,
      "INVALID_TRANSITION",
      "진행 중인 만남을 한 번만 종료할 수 있어요.",
    );
  m.status = "ended";
  m.endedAt = new Date().toISOString();
  s.finalCheckpoint = {
    id: randomUUID(),
    runId: s.runId,
    proposalId: m.proposalId,
    storyConnectionId: m.connectionId,
    peerAlias: peer.alias,
    endedAt: m.endedAt,
  };
  s.replayContext = { mode: "normal", checkpointId: null };
  openFinal(s);
}
export function journeyProjection(s, actor, now) {
  const m = s.social.meeting,
    f = s.final;
  let phase = "none";
  if (f) phase = f.status;
  else if (m.status === "started" && linked(s)) phase = "meeting";
  else if (m.status === "confirmed" && linked(s))
    phase = navApplied(s) ? "travel" : "confirmed";
  else if (
    s.vehicleActivation &&
    s.social.connection.attempted &&
    (!linked(s) || ["cancelled", "declined"].includes(m.status))
  )
    phase = "early_end";
  const own =
    actor === "car" ? f?.aChoice : actor === "operator" ? f?.bChoice : null;
  const core = vehicleReady(s, now);
  const interests = s.profile?.privateSummary.interests || [];
  return {
    phase,
    replay: replay(s),
    storyTime: ["pending", "together", "my_agent", "cancelled"].includes(phase)
      ? "14:35"
      : phase === "meeting"
        ? "14:15"
        : null,
    final: f
      ? {
          id: f.id,
          round: f.round,
          requestId: f.requestId,
          status: f.status,
          myChoice: own ?? null,
        }
      : null,
    scene:
      actor === "car" && phase === "meeting"
        ? m.reenactment?.variant === "familiar"
          ? FAMILIAR_MEETING
          : GENERAL_MEETING
        : actor === "car" && phase === "together"
          ? TOGETHER_SCENE
          : [],
    meetingVariant: m.reenactment?.variant ?? null,
    peerIntroSeen: (s.storyContext ?? initialStory()).peerIntroSeen,
    ownPrompt:
      actor !== "car"
        ? null
        : phase === "early_end" || phase === "cancelled"
          ? "지금은 어떤 여행을 이어가고 싶어?"
          : phase === "my_agent"
            ? interests.includes("sea_walk")
              ? "이제 네 여행은 어떻게 이어가고 싶어? 바다 산책을 좋아한다고 했지."
              : "이제 네 여행은 어떻게 이어가고 싶어?"
            : null,
    ownQuestions: actor === "car" ? OWN_QUESTIONS : [],
    ownClosing:
      actor !== "car"
        ? ""
        : s.profile?.privateSummary.speakingStyle === "light_humor" &&
            interests.includes("sea_walk") &&
            interests.includes("cafe")
          ? "바다 한 장, 커피 한 잔. 네가 좋아하던 여행 그대로네 ㅎㅎ. 14:55쯤 다음 일정을 준비해보자."
          : "네가 원하던 대로 천천히 쉬어가자. 14:55쯤 다음 일정을 준비하면 돼.",
    canInteract: core,
    cleanupRequired: !!s.navigation?.owned,
    blockedReason: core
      ? null
      : "정차·활성 차량과 내비·복구 상태를 확인해 주세요.",
  };
}
export function validateEnding(s) {
  const m = s.social.meeting,
    f = s.final,
    cp = s.finalCheckpoint;
  if (
    ["started", "ended"].includes(m.status) &&
    (!m.aConsent || !m.bConsent || !m.reenactment)
  )
    throw Error("동의/재연 기록 없는 만남");
  if (cp && (!checkpointValid(s) || !m.endedAt || cp.endedAt !== m.endedAt))
    throw Error("잘못된 결말 checkpoint");
  if (replay(s) && (!cp || s.replayContext.checkpointId !== cp.id))
    throw Error("잘못된 재시연 맥락");
  if (f) {
    if (!cp || f.round !== s.finalRound || f.round < 1)
      throw Error("잘못된 최종 선택 회차");
    const both = f.aChoice !== null && f.bChoice !== null;
    if (f.status === "pending" && (both || f.requestId !== f.issuedRequestId))
      throw Error("잘못된 대기 선택");
    if (f.status !== "pending" && f.requestId !== null)
      throw Error("종료되지 않은 선택 요청");
    if (
      ["together", "my_agent"].includes(f.status) &&
      (!both ||
        f.status !==
          (f.aChoice === "together" && f.bChoice === "together"
            ? "together"
            : "my_agent"))
    )
      throw Error("양쪽 선택 없는 결말");
    if (f.status === "cancelled" && both)
      throw Error("확정 결말을 취소로 변경");
  } else if (cp || (s.finalRound ?? 0) !== 0)
    throw Error("최종 선택 없는 결말 회차");
  if (f && (s.finalHistory || []).length !== f.round - 1)
    throw Error("선택 이력 순번 불일치");
  if (f?.status === "pending" && !replay(s) && !linked(s))
    throw Error("종료된 연결의 대기 선택");
  if (
    ["started", "ended"].includes(m.status) &&
    !s.navigation?.attempts.some(
      (a) =>
        a.context === "meeting" &&
        a.proposalId === m.proposalId &&
        a.operation === "add" &&
        a.outcome === "applied",
    )
  )
    throw Error("내비 근거 없는 만남");
  const ids = new Set();
  let round = 0;
  for (const x of s.finalHistory || []) {
    if (
      ids.has(x.id) ||
      x.round <= round ||
      x.round >= s.finalRound ||
      !["together", "my_agent"].includes(x.status) ||
      x.requestId !== null ||
      !x.aChoice ||
      !x.bChoice ||
      x.status !==
        (x.aChoice === "together" && x.bChoice === "together"
          ? "together"
          : "my_agent")
    )
      throw Error("잘못된 이전 선택 이력");
    ids.add(x.id);
    round = x.round;
  }
  if (f && ids.has(f.id)) throw Error("중복된 현재 선택 ID");
}
