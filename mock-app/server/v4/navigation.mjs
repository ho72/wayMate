import { linked } from "./social.mjs";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { fail, parked } from "./handoff.mjs";
export const place = Object.freeze({
  name: "소프트웨어드림센터",
  poiId: "36khp2hdj2cfcm5nqhe3",
  latitude: 37.41275833,
  longitude: 127.09481944,
});
export const emptyNavigation = () => ({
  observation: null,
  attempts: [],
  owned: null,
});
const near = (a, b) =>
  Math.abs(a.latitude - b.latitude) <= 0.00001 &&
  Math.abs(a.longitude - b.longitude) <= 0.00001;
export const identity = (a, b) =>
  near(a, b) && a.name === b.name && a.poiId === b.poiId;
const distance = (a, b) => {
  const rad = Math.PI / 180,
    x = (b.latitude - a.latitude) * rad,
    y = (b.longitude - a.longitude) * rad;
  return (
    12742000 *
    Math.asin(
      Math.sqrt(
        Math.sin(x / 2) ** 2 +
          Math.cos(a.latitude * rad) *
            Math.cos(b.latitude * rad) *
            Math.sin(y / 2) ** 2,
      ),
    )
  );
};
export function validEvidence(e, after = -1, session = null) {
  const { first: a, second: b, lookup: p } = e;
  return (
    (!session || a.sessionId === session) &&
    a.sessionId === b.sessionId &&
    a.querySeq < b.querySeq &&
    a.startedAt > after &&
    a.completedAt >= a.startedAt &&
    b.startedAt >= a.completedAt + 1000 &&
    b.completedAt >= b.startedAt &&
    identity(a.destination, b.destination) &&
    a.waypoints.length === b.waypoints.length &&
    a.waypoints.every((x, i) => identity(x, b.waypoints[i])) &&
    a.naviMode === "ROUTE_GUIDING" &&
    b.naviMode === "ROUTE_GUIDING" &&
    !a.isRouting &&
    !b.isRouting &&
    (a.destination.latitude !== 0 || a.destination.longitude !== 0) &&
    p.sessionId === b.sessionId &&
    p.poiId === place.poiId &&
    p.point.poiId === place.poiId &&
    distance(p.point, place) <= 30 &&
    b.completedAt >= p.receivedAt &&
    b.completedAt - p.receivedAt < 600000
  );
}
const isM = (w, e) =>
  w.name === place.name &&
  w.poiId === place.poiId &&
  ((w.latitude === 0 && w.longitude === 0) ||
    near(w, place) ||
    near(w, e.lookup.point));
const unsettled = (n) =>
  n.attempts.some((a) => ["pending", "unknown"].includes(a.outcome));
function session(s, p) {
  if (
    p.vehicleSessionId !== s.vehicle.vehicleSessionId ||
    p.vehicleEpoch !== s.vehicle.vehicleEpoch
  )
    fail(409, "STALE_STATE", "차량 세션이 바뀌었어요.");
}
function freshEvidence(s, n, now) {
  const o = n.observation;
  if (
    !o ||
    o.vehicleSessionId !== s.vehicle.vehicleSessionId ||
    o.vehicleEpoch !== s.vehicle.vehicleEpoch ||
    now < o.receivedAt ||
    now - o.receivedAt >= 2000 ||
    !validEvidence(o.evidence)
  )
    fail(
      409,
      "NAV_NOT_READY",
      "내비에서 최신 목적지와 경유지를 다시 확인해 주세요.",
    );
  return o.evidence;
}
function guard(s, n, now) {
  if (
    s.vehicle.navigationSource !== "real" ||
    !s.vehicleActivation ||
    s.vehicleActivation.deviceId !== s.vehicle.deviceId ||
    !parked(s, now) ||
    s.vehicle.uiContext !== "navigation"
  )
    fail(423, "RESTRICTED", "차량 앱의 정차·활성 상태에서 승인해 주세요.");
  return freshEvidence(s, n, now);
}
function applyPhysicalNavigation(s, c, now) {
  const p = c.payload;
  session(s, p);
  const n = (s.navigation ??= emptyNavigation());
  if (c.type === "NAV_OBSERVE") {
    if (s.vehicle.navigationSource !== "real")
      fail(409, "NAV_NOT_READY", "실제 내비 연결이 필요해요.");
    const old = n.observation;
    if (
      old?.vehicleSessionId === p.vehicleSessionId &&
      old.evidence.second.sessionId === p.evidence.second.sessionId &&
      old.evidence.second.querySeq >= p.evidence.second.querySeq
    )
      fail(409, "STALE_STATE", "새 내비 관측이 필요해요.");
    n.observation = { ...p, receivedAt: now };
    return;
  }
  if (c.type === "NAV_APPROVE") {
    const e = guard(s, n, now),
      b = e.second;
    if (unsettled(n) || !equal(e, p.reviewed))
      fail(
        409,
        "NAV_NOT_READY",
        "경로가 바뀌었거나 미확인 요청이 있어요. 다시 확인해 주세요.",
      );
    if (
      p.operation === "add"
        ? n.owned || b.waypoints.length !== 0 || p.ownedAttemptId !== null
        : !n.owned ||
          p.ownedAttemptId !== n.owned.attemptId ||
          !identity(b.destination, n.owned.destination) ||
          b.waypoints.length !== 1 ||
          !identity(b.waypoints[0], n.owned.waypoint) ||
          !isM(b.waypoints[0], e)
    )
      fail(
        409,
        "NAV_NOT_READY",
        "현재 경로에서 wayMate 경유지만 변경할 수 있어요.",
      );
    n.attempts.push({
      attemptId: randomUUID(),
      operation: p.operation,
      deviceId: s.vehicle.deviceId,
      vehicleSessionId: p.vehicleSessionId,
      vehicleEpoch: p.vehicleEpoch,
      sdkSessionId: b.sessionId,
      baseline: b.destination,
      before: e,
      ownedAttemptId: p.ownedAttemptId,
      dispatch: "not_started",
      executionRecordId: null,
      dispatchAt: null,
      outcome: "pending",
      reports: [],
    });
    return;
  }
  const a = n.attempts.find(
    (a) => a.attemptId === p.attemptId && a.deviceId === s.vehicle.deviceId,
  );
  if (!a) fail(409, "NAV_NOT_READY", "확인할 실행 기록이 없어요.");
  if (c.type === "NAV_CANCEL") {
    if (a.dispatch !== "not_started" || a.outcome !== "pending")
      fail(409, "NAV_NOT_READY", "이미 실행 여부 확인이 필요한 요청이에요.");
    a.outcome = "not_dispatched";
    return;
  }
  if (c.type === "NAV_DISPATCH_BEGIN") {
    const e = guard(s, n, now);
    if (
      a.vehicleSessionId !== p.vehicleSessionId ||
      a.vehicleEpoch !== p.vehicleEpoch ||
      a.dispatch !== "not_started" ||
      a.outcome !== "pending" ||
      !equal(e.second.destination, a.baseline) ||
      !equal(e.second.waypoints, a.before.second.waypoints) ||
      e.second.sessionId !== a.sdkSessionId ||
      p.dispatchAt < e.second.completedAt ||
      p.dispatchAt - e.second.completedAt > 2000
    )
      fail(
        409,
        "NAV_NOT_READY",
        "승인한 경로와 최신 내비 상태가 다르거나 실행권이 만료됐어요.",
      );
    a.dispatch = "may_have_executed";
    a.executionRecordId = p.executionRecordId;
    a.dispatchAt = p.dispatchAt;
    return {
      granted: true,
      attemptId: a.attemptId,
      executionRecordId: a.executionRecordId,
      validForMs: 1500,
    };
  }
  if (c.type === "NAV_REPORT") {
    if (
      a.executionRecordId !== p.executionRecordId &&
      !(a.dispatch === "not_started" && p.outcome === "not_dispatched")
    )
      fail(409, "NAV_NOT_READY", "실행 기록 ID가 달라요.");
    const prior = a.reports.find((r) => r.reportId === p.reportId);
    if (prior) {
      if (
        !equal(prior, {
          reportId: p.reportId,
          outcome: p.outcome,
          evidence: p.evidence,
        })
      )
        fail(400, "COMMAND_ID_REUSED", "보고 ID의 내용을 바꿀 수 없어요.");
      return;
    }
    if (
      ["applied", "removed", "not_dispatched"].includes(a.outcome) &&
      !(a.outcome === "not_dispatched" && p.outcome === "not_dispatched")
    )
      fail(409, "NAV_NOT_READY", "이미 확인을 마친 요청이에요.");
    if (p.outcome === "not_dispatched") {
      // Awaiting-grant journal proves the SDK entry was never reached. Never infer this from absence.
      if (p.evidence !== null)
        fail(
          400,
          "INVALID_PAYLOAD",
          "미실행 보고에는 경로 추정값을 넣지 마세요.",
        );
    } else if (p.outcome !== "unknown") {
      const e = p.evidence,
        b = e?.second;
      if (
        a.dispatch !== "may_have_executed" ||
        !e ||
        !validEvidence(e, a.dispatchAt, a.sdkSessionId) ||
        !identity(b.destination, a.baseline) ||
        (a.operation === "add"
          ? p.outcome !== "applied" ||
            b.waypoints.length !== 1 ||
            !isM(b.waypoints[0], e)
          : p.outcome !== "removed" || b.waypoints.length !== 0)
      )
        fail(
          409,
          "NAV_NOT_READY",
          "실제 반영을 증명하는 내비 관측이 부족해요.",
        );
    }
    a.reports.push({
      reportId: p.reportId,
      outcome: p.outcome,
      evidence: p.evidence,
    });
    a.outcome = p.outcome;
    if (p.outcome === "applied")
      n.owned = {
        attemptId: a.attemptId,
        destination: p.evidence.second.destination,
        waypoint: p.evidence.second.waypoints[0],
      };
    if (p.outcome === "removed") n.owned = null;
  }
}

/** Validate durable ownership too; schema validity alone does not establish an execution history. */
export function validateNavigation(s) {
  const n = s.navigation;
  if (!n) return;
  const ids = new Set(),
    executions = new Set();
  for (const a of n.attempts) {
    if (ids.has(a.attemptId)) throw new Error("중복 내비 시도 ID");
    ids.add(a.attemptId);
    if (a.deviceId !== s.vehicleActivation?.deviceId)
      throw new Error("내비 실행 차량 불일치");
    if (a.executionRecordId) {
      if (executions.has(a.executionRecordId))
        throw new Error("중복 내비 실행 ID");
      executions.add(a.executionRecordId);
    }
    if (
      (a.dispatch === "not_started") !== (a.executionRecordId === null) ||
      (a.dispatch === "not_started") !== (a.dispatchAt === null)
    )
      throw new Error("잘못된 내비 실행 단계");
    if (
      a.outcome === "applied" &&
      (a.operation !== "add" || a.dispatch !== "may_have_executed")
    )
      throw new Error("추가 이력 불일치");
    if (
      a.outcome === "removed" &&
      (a.operation !== "remove" || a.dispatch !== "may_have_executed")
    )
      throw new Error("제거 이력 불일치");
    const seen = new Set();
    for (const r of a.reports) {
      if (seen.has(r.reportId)) throw new Error("중복 보고 ID");
      seen.add(r.reportId);
    }
  }
  if (n.owned) {
    const a = n.attempts.find((a) => a.attemptId === n.owned.attemptId);
    const e = a?.reports.findLast((r) => r.outcome === "applied")?.evidence;
    if (
      !a ||
      a.outcome !== "applied" ||
      !e ||
      !identity(n.owned.destination, e.second.destination) ||
      !identity(n.owned.waypoint, e.second.waypoints[0])
    )
      throw new Error("내비 소유권 이력 불일치");
  }
}

export function applyNavigation(s, c, now) {
  const m = s.social.meeting,
    p = c.payload,
    n = s.navigation;
  if (
    ["NAV_APPROVE", "NAV_REMOVE_APPROVE", "NAV_DISPATCH_BEGIN"].includes(
      c.type,
    ) &&
    s.social.testRestricted
  )
    fail(423, "RESTRICTED", "시연용 제한이 적용돼 있어요.");
  let normalized = c;
  if (c.type === "NAV_REMOVE_APPROVE")
    normalized = { ...c, type: "NAV_APPROVE" };
  if (["NAV_APPROVE", "NAV_REMOVE_APPROVE"].includes(c.type)) {
    if (p.operation === "add" && s.journeyMode === "connected") {
      if (
        c.type !== "NAV_APPROVE" ||
        !linked(s) ||
        m.status !== "confirmed" ||
        !m.aConsent ||
        !m.bConsent ||
        c.target.proposalId !== m.proposalId
      )
        fail(
          409,
          "NOT_READY",
          "현재 만남의 양쪽 동의와 운전자 승인이 필요해요.",
        );
    } else if (
      p.operation === "add" &&
      (c.type !== "NAV_APPROVE" || Object.keys(c.target).length)
    )
      fail(409, "NOT_READY", "본인 여행의 경유지 승인을 확인해 주세요.");
    if (p.operation === "remove" && c.target.reason === "reset_cleanup") {
      if (
        !s.reset ||
        c.type !== "NAV_REMOVE_APPROVE" ||
        c.target.resetId !== s.reset.id ||
        s.reset.requiredDeviceId !== s.vehicle.deviceId ||
        !n?.owned ||
        p.ownedAttemptId !== n.owned.attemptId
      )
        fail(
          409,
          "NOT_READY",
          "현재 초기화의 자기 경유지 정리 승인이 필요해요.",
        );
    } else if (p.operation === "remove") {
      const owned = n?.attempts.find((a) => a.attemptId === n.owned?.attemptId);
      if (
        owned?.context === "meeting" &&
        (c.type !== "NAV_REMOVE_APPROVE" ||
          m.status !== "cancelled" ||
          c.target.proposalId !== owned.proposalId ||
          c.target.reason !== "meeting_cancel")
      )
        fail(409, "NOT_READY", "취소한 만남의 경유지 정리 승인이 필요해요.");
    }
  }
  if (c.type === "NAV_DISPATCH_BEGIN") {
    const a = n?.attempts.find((a) => a.attemptId === p.attemptId);
    if (
      a?.context === "meeting" &&
      a.operation === "add" &&
      (!linked(s) || m.status !== "confirmed" || a.proposalId !== m.proposalId)
    )
      fail(409, "NOT_READY", "만남이 취소되거나 연결이 끝나 실행을 멈췄어요.");
  }
  const result = applyPhysicalNavigation(s, normalized, now);
  if (["NAV_APPROVE", "NAV_REMOVE_APPROVE"].includes(c.type)) {
    const a = s.navigation.attempts.at(-1),
      owned = s.navigation.attempts.find(
        (a) => a.attemptId === p.ownedAttemptId,
      );
    if (c.target.reason === "reset_cleanup") a.resetId = c.target.resetId;
    a.approvalCommandId = c.commandId;
    a.context =
      p.operation === "add"
        ? s.journeyMode === "connected"
          ? "meeting"
          : "driver_waypoint"
        : (owned?.context ?? "driver_waypoint");
    a.proposalId =
      a.context === "meeting"
        ? p.operation === "add"
          ? m.proposalId
          : owned.proposalId
        : null;
  }
  return result;
}
