import { randomUUID } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { fail, parked } from "./handoff.mjs";
import { linked } from "./social.mjs";

const destination = {
  name: "모의 기존 목적지 D",
  poiId: "mock-original-d",
  latitude: 0,
  longitude: 0,
};
const waypoint = {
  name: "바다쉼표 카페 · 모의",
  poiId: "fiction-cafe-01",
  latitude: 0,
  longitude: 0,
};
export const initialMockNavigation = () => ({
  source: "mock",
  route: { revision: 0, destination: { ...destination }, waypoints: [] },
  attempts: [],
  owned: null,
});
export const mockMode = (s) =>
  (s.navigationMode ?? s.vehicle.navigationSource) === "mock";
export const mockPending = (s) =>
  s.mockNavigation?.attempts.some((a) =>
    ["pending", "unknown"].includes(a.outcome),
  ) || false;
export const realPending = (s) =>
  s.navigation?.attempts.some((a) =>
    ["pending", "unknown"].includes(a.outcome),
  ) || false;
const ready = (s, now) =>
  !!s.vehicleActivation &&
  s.vehicleActivation.deviceId === s.vehicle.deviceId &&
  parked(s, now) &&
  s.vehicle.uiContext === "navigation" &&
  !s.social.testRestricted &&
  !s.recovery &&
  !realPending(s);
function approval(s, operation) {
  const n = s.mockNavigation,
    owner = n?.attempts.find((a) => a.attemptId === n.owned?.attemptId);
  if (operation === "add") {
    if (
      s.reset ||
      n.owned ||
      (s.journeyMode === "connected" &&
        (!linked(s) || s.social.meeting.status !== "confirmed"))
    )
      return null;
    return {
      context: s.journeyMode === "connected" ? "meeting" : "driver_waypoint",
      proposalId:
        s.journeyMode === "connected" ? s.social.meeting.proposalId : null,
      reason: "add",
      resetId: null,
    };
  }
  if (
    !owner ||
    n.route.waypoints.length !== 1 ||
    !equal(n.route.waypoints[0], waypoint)
  )
    return null;
  if (s.reset)
    return {
      context: owner.context,
      proposalId: owner.proposalId,
      reason: "reset_cleanup",
      resetId: s.reset.id,
    };
  if (
    owner.context === "meeting" &&
    (s.social.meeting.status !== "cancelled" ||
      owner.proposalId !== s.social.meeting.proposalId)
  )
    return null;
  return {
    context: owner.context,
    proposalId: owner.proposalId,
    reason: owner.context === "meeting" ? "meeting_cancel" : "driver_waypoint",
    resetId: null,
  };
}
const bind = (commandType, target, payload) => ({
  commandType,
  target,
  payload,
});
const targetFor = (a) =>
  a.reason === "add"
    ? a.proposalId
      ? { proposalId: a.proposalId }
      : {}
    : a.reason === "reset_cleanup"
      ? { reason: a.reason, resetId: a.resetId }
      : a.proposalId
        ? { reason: a.reason, proposalId: a.proposalId }
        : { reason: a.reason };
export function mockBindings(s, actor, now) {
  const n = s.mockNavigation,
    b = {};
  if (actor === "operator") {
    if (
      !mockMode(s) &&
      !s.reset &&
      !s.recovery &&
      !realPending(s) &&
      !s.navigation?.owned &&
      s.navigation?.attempts.some((a) => a.outcome === "not_dispatched")
    )
      b.NAV_MOCK_CONTINUE = bind("NAV_MOCK_CONTINUE", {}, {});
    return b;
  }
  if (!mockMode(s) || !n || actor !== "car") return b;
  const pending = n.attempts.find((a) => a.outcome === "pending");
  if (pending && s.vehicleActivation?.deviceId === s.vehicle.deviceId)
    b.NAV_CANCEL = bind(
      "NAV_CANCEL",
      {},
      {
        source: "mock",
        attemptId: pending.attemptId,
        vehicleSessionId: s.vehicle.vehicleSessionId,
        vehicleEpoch: s.vehicle.vehicleEpoch,
      },
    );
  if (!ready(s, now) || mockPending(s)) return b;
  for (const operation of ["add", "remove"]) {
    if (operation === "add" && s.replayContext?.mode === "final_replay")
      continue;
    const a = approval(s, operation);
    if (!a) continue;
    const payload = {
      source: "mock",
      operation,
      vehicleSessionId: s.vehicle.vehicleSessionId,
      vehicleEpoch: s.vehicle.vehicleEpoch,
      reviewedRouteRevision: n.route.revision,
      ownedAttemptId: n.owned?.attemptId ?? null,
    };
    const latest = [...n.attempts]
      .reverse()
      .find((x) => x.operation === operation);
    if (latest && ["failed", "not_dispatched"].includes(latest.outcome))
      b[`NAV_RETRY_${operation.toUpperCase()}`] = bind(
        "NAV_RETRY",
        { attemptId: latest.attemptId },
        payload,
      );
    else
      b[operation === "add" ? "NAV_APPROVE" : "NAV_REMOVE_APPROVE"] = bind(
        operation === "add" ? "NAV_APPROVE" : "NAV_REMOVE_APPROVE",
        targetFor(a),
        payload,
      );
  }
  return b;
}
export function applyMockNavigation(s, c, now) {
  if (c.type === "NAV_MOCK_CONTINUE") {
    if (c.actor !== "operator")
      fail(403, "ACTOR_FORBIDDEN", "시연자만 표시 모드를 바꿀 수 있어요.");
    if (realPending(s) || s.navigation?.owned || s.recovery)
      fail(
        423,
        "RECOVERY_REQUIRED",
        "실제 내비의 미확정 작업과 경유지 정리를 먼저 확인해 주세요.",
      );
    if (!s.navigation?.attempts.some((a) => a.outcome === "not_dispatched"))
      fail(409, "NOT_READY", "종료된 실제 미실행 이력이 필요해요.");
    s.navigationMode = "mock";
    s.mockNavigation ??= initialMockNavigation();
    return;
  }
  const p = c.payload,
    t = c.target,
    n = s.mockNavigation;
  if (c.type === "NAV_MOCK_RESULT") {
    if (c.actor !== "operator")
      fail(403, "ACTOR_FORBIDDEN", "모의 결과는 시연자만 지정해요.");
    const a = n?.attempts.find((a) => a.attemptId === t.attemptId);
    if (!a || a.source !== "mock" || t.operation !== a.operation)
      fail(409, "STALE_STATE", "현재 회차의 모의 요청이 아니에요.");
    if (!["pending", "unknown"].includes(a.outcome))
      fail(409, "INVALID_TRANSITION", "확정한 모의 결과는 바꿀 수 없어요.");
    if (
      (p.outcome === "applied" && a.operation !== "add") ||
      (p.outcome === "removed" && a.operation !== "remove")
    )
      fail(400, "INVALID_PAYLOAD", "추가·제거 작업과 결과가 다릅니다.");
    a.results.push({ commandId: c.commandId, outcome: p.outcome });
    a.outcome = p.outcome;
    a.dispatch = p.outcome === "unknown" ? "awaiting_result" : "settled";
    if (p.outcome === "applied") {
      n.route.waypoints = [{ ...waypoint }];
      n.owned = { attemptId: a.attemptId };
      n.route.revision++;
    }
    if (p.outcome === "removed") {
      n.route.waypoints = [];
      n.owned = null;
      n.route.revision++;
    }
    return;
  }
  if (c.actor !== "car")
    fail(403, "ACTOR_FORBIDDEN", "운전자 승인이 필요해요.");
  if (!mockMode(s) || !n || p.source !== "mock")
    fail(409, "NAV_NOT_READY", "현재 모의 내비 모드를 확인해 주세요.");
  if (
    p.vehicleSessionId !== s.vehicle.vehicleSessionId ||
    p.vehicleEpoch !== s.vehicle.vehicleEpoch
  )
    fail(409, "STALE_STATE", "차량 세션이 바뀌었어요.");
  if (c.type === "NAV_CANCEL") {
    const a = n.attempts.find((a) => a.attemptId === p.attemptId);
    if (!a || a.outcome !== "pending")
      fail(409, "NAV_NOT_READY", "미확인 결과는 취소로 확정할 수 없어요.");
    a.outcome = "not_dispatched";
    a.dispatch = "settled";
    return;
  }
  if (!ready(s, now) || mockPending(s))
    fail(423, "RESTRICTED", "정차·활성·내비 미확정 상태를 확인해 주세요.");
  const operation = p.operation,
    context = approval(s, operation);
  if (
    !context ||
    p.reviewedRouteRevision !== n.route.revision ||
    p.ownedAttemptId !== (n.owned?.attemptId ?? null)
  )
    fail(409, "NAV_NOT_READY", "승인한 모의 경로·만남·정리 대상이 바뀌었어요.");
  if (c.type === "NAV_RETRY") {
    const old = n.attempts.find((a) => a.attemptId === t.attemptId);
    if (
      !old ||
      old.source !== "mock" ||
      old.operation !== operation ||
      old.dispatch !== "settled" ||
      [...n.attempts].reverse().find((a) => a.operation === operation)
        ?.attemptId !== old.attemptId ||
      !["failed", "not_dispatched"].includes(old.outcome) ||
      (operation === "remove" &&
        old.ownedAttemptId !== (n.owned?.attemptId ?? null)) ||
      (operation === "add" && old.proposalId !== context.proposalId)
    )
      fail(
        409,
        "NAV_NOT_READY",
        "실패·미반영 종료가 확인된 같은 모의 작업만 다시 승인해 주세요.",
      );
  } else if (
    c.type !== (operation === "add" ? "NAV_APPROVE" : "NAV_REMOVE_APPROVE") ||
    !equal(t, targetFor(context))
  )
    fail(409, "STALE_STATE", "현재 모의 승인 대상을 확인해 주세요.");
  n.attempts.push({
    attemptId: randomUUID(),
    source: "mock",
    operation,
    deviceId: s.vehicle.deviceId,
    vehicleSessionId: p.vehicleSessionId,
    vehicleEpoch: p.vehicleEpoch,
    approvalCommandId: c.commandId,
    ownedAttemptId: p.ownedAttemptId,
    previousAttemptId: c.type === "NAV_RETRY" ? t.attemptId : null,
    ...context,
    outcome: "pending",
    dispatch: "awaiting_result",
    results: [],
  });
}
export function mockProjection(s, actor) {
  return actor === "car" || actor === "operator"
    ? structuredClone(s.mockNavigation ?? null)
    : null;
}
export function validateMockNavigation(s) {
  const n = s.mockNavigation;
  if (!n) return;
  if (!equal(n.route.destination, destination))
    throw Error("모의 기준 목적지 불일치");
  const ids = new Set(),
    resultIds = new Set(),
    previous = new Map();
  let owned = null,
    revision = 0,
    pending = 0;
  for (const a of n.attempts) {
    const old = previous.get(a.operation);
    if (
      ids.has(a.attemptId) ||
      a.source !== "mock" ||
      a.deviceId !== s.vehicleActivation?.deviceId ||
      (a.dispatch === "awaiting_result") !==
        ["pending", "unknown"].includes(a.outcome) ||
      (a.outcome === "applied" && a.operation !== "add") ||
      (a.outcome === "removed" && a.operation !== "remove") ||
      a.ownedAttemptId !== owned ||
      (a.operation === "add" ? owned !== null : owned === null) ||
      pending
    )
      throw Error("모의 실행 이력 불일치");
    if (
      a.previousAttemptId &&
      (!old ||
        a.previousAttemptId !== old.attemptId ||
        !["failed", "not_dispatched"].includes(old.outcome))
    )
      throw Error("모의 재시도 참조 불일치");
    if (
      ["pending", "not_dispatched"].includes(a.outcome)
        ? a.results.length !== 0
        : a.results.at(-1)?.outcome !== a.outcome
    )
      throw Error("모의 결과 이력 불일치");
    for (let i = 0; i < a.results.length; i++) {
      const r = a.results[i];
      if (
        resultIds.has(r.commandId) ||
        (i < a.results.length - 1 && r.outcome !== "unknown")
      )
        throw Error("모의 결과 확정 순서 불일치");
      resultIds.add(r.commandId);
    }
    ids.add(a.attemptId);
    previous.set(a.operation, a);
    if (["pending", "unknown"].includes(a.outcome)) pending++;
    if (a.outcome === "applied") {
      owned = a.attemptId;
      revision++;
    }
    if (a.outcome === "removed") {
      owned = null;
      revision++;
    }
  }
  if (
    n.route.revision !== revision ||
    (n.owned?.attemptId ?? null) !== owned ||
    !equal(n.route.waypoints, owned ? [waypoint] : [])
  )
    throw Error("모의 경로·소유권 복원 불일치");
}
