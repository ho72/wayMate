import { randomUUID } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { fail, parked, fresh } from "./handoff.mjs";
import { validEvidence, place } from "./navigation.mjs";

const pending = (s) =>
  s.navigation?.attempts.some((a) =>
    ["pending", "unknown"].includes(a.outcome),
  );
const pointEqual = (a, b) =>
  a.name === b.name &&
  a.poiId === b.poiId &&
  Math.abs(a.latitude - b.latitude) <= 0.00001 &&
  Math.abs(a.longitude - b.longitude) <= 0.00001;
export function cleanBaseline(s, evidence, now) {
  const n = s.navigation;
  if (s.recovery || pending(s) || n?.owned || !validEvidence(evidence))
    return false;
  const o = n?.observation;
  if (
    !o ||
    o.vehicleSessionId !== s.vehicle.vehicleSessionId ||
    o.vehicleEpoch !== s.vehicle.vehicleEpoch ||
    now < o.receivedAt ||
    now - o.receivedAt >= 2000 ||
    !equal(o.evidence, evidence)
  )
    return false;
  const b = evidence.second;
  return (n?.attempts || [])
    .filter((a) => a.operation === "add")
    .every(
      (a) =>
        pointEqual(b.destination, a.baseline) &&
        b.waypoints.length === a.before.second.waypoints.length &&
        b.waypoints.every((w, i) =>
          pointEqual(w, a.before.second.waypoints[i]),
        ),
    );
}
export function resetReasons(s) {
  const r = s.reset;
  if (!r) return [];
  return [
    ...(s.recovery ? [s.recovery.message] : []),
    ...(pending(s) ? ["미확정 내비 실행 기록 확인 필요"] : []),
    ...(s.navigation?.owned ? ["wayMate 경유지 제거 승인·실제 정리 필요"] : []),
    ...(r.requiredWebClientId && !r.webAck
      ? ["모바일 화면·초안 정리 ACK 대기"]
      : []),
    ...(r.requiredDeviceId && !r.carAck
      ? ["실행 차량의 화면·내비 정리 ACK 대기"]
      : []),
  ];
}
export function resetView(s, actor, id, now) {
  const r = s.reset;
  if (!r) return null;
  const eligible =
    actor === "web"
      ? r.requiredWebClientId !== null && r.requiredWebClientId === id
      : actor === "car" &&
        r.requiredDeviceId === s.vehicle.deviceId &&
        fresh(s, now) &&
        s.vehicle.foreground &&
        (!r.navigationRequired ||
          (parked(s, now) &&
            !s.social.testRestricted &&
            s.vehicle.navigationSource === "real" &&
            !!s.navigation?.observation &&
            cleanBaseline(s, s.navigation.observation.evidence, now)));
  return {
    id: r.id,
    runId: r.runId,
    requiredWebClientId: r.requiredWebClientId,
    requiredDeviceId: r.requiredDeviceId,
    navigationRequired: r.navigationRequired,
    webAcknowledged: !!r.webAck,
    carAcknowledged: !!r.carAck,
    status: s.recovery || pending(s) ? "needs_recovery" : "waiting",
    blockedReasons: resetReasons(s),
    canAcknowledge: !!eligible,
  };
}
export function lastCompletedReset(s) {
  const a = s.resetHistory?.at(-1);
  if (!a) return null;
  return {
    id: a.reset.id,
    fromRunId: a.runId,
    newRunId: a.reset.newRunId,
    deviceId: a.reset.requiredDeviceId,
    settledAttemptIds: a.navigation?.attempts.map((a) => a.attemptId) || [],
    completedAt: a.reset.completedAt,
    webCleanup: a.reset.webAck
      ? "acknowledged"
      : a.reset.requiredDeviceId
        ? "deferred"
        : "not_required",
  };
}
export function resetBindings(s, actor, id, now) {
  if (actor === "operator")
    return {
      RESET_BEGIN: {
        commandType: "RESET_BEGIN",
        target: { runId: s.runId },
        payload: {},
      },
    };
  const r = s.reset,
    v = resetView(s, actor, id, now);
  if (!r || !v.canAcknowledge) return {};
  const cleared = { ui: true, audio: true, pendingRequests: true };
  return {
    RESET_ACK: {
      commandType: "RESET_ACK",
      target: { resetId: r.id },
      payload:
        actor === "web"
          ? { webClientId: id, cleared }
          : {
              deviceId: s.vehicle.deviceId,
              vehicleSessionId: s.vehicle.vehicleSessionId,
              vehicleEpoch: s.vehicle.vehicleEpoch,
              cleared,
              pendingAttemptIds: [],
              evidence: r.navigationRequired
                ? s.navigation.observation.evidence
                : null,
              journal: null,
            },
    },
  };
}
export function guardDuringReset(s, c) {
  if (!s.reset && !s.recovery) return;
  if (
    [
      "RESET_BEGIN",
      "RESET_ACK",
      "CAR_SESSION_OPEN",
      "CAR_STATUS",
      "NAV_OBSERVE",
      "NAV_REPORT",
      "NAV_CANCEL",
      "CONNECT_CANCEL",
      "CONNECT_END",
      "MEETING_CANCEL",
      "PROFILE_PRIVATE",
      "CANCEL_PENDING_COMMAND",
      "SET_TEST_RESTRICTION",
    ].includes(c.type)
  )
    return;
  if (
    c.type === "NAV_REMOVE_APPROVE" &&
    s.reset &&
    c.payload.operation === "remove" &&
    c.target.reason === "reset_cleanup" &&
    c.target.resetId === s.reset.id
  )
    return;
  if (c.type === "NAV_DISPATCH_BEGIN") {
    const a = s.navigation?.attempts.find(
      (a) => a.attemptId === c.payload.attemptId,
    );
    if (a?.operation === "remove" && a.resetId === s.reset?.id && s.reset)
      return;
  }
  fail(
    423,
    s.recovery ? "RECOVERY_REQUIRED" : "RESETTING",
    "초기화 정리와 필수 ACK를 먼저 확인해 주세요.",
  );
}
export function applyReset(s, c, id, now) {
  if (c.type === "RESET_BEGIN") {
    if (c.actor !== "operator")
      fail(403, "ACTOR_FORBIDDEN", "시연자만 초기화를 시작할 수 있어요.");
    if (c.target.runId !== s.runId)
      fail(409, "RUN_CHANGED", "현재 회차를 확인해 주세요.");
    if (s.reset) return;
    s.reset = {
      id: randomUUID(),
      runId: s.runId,
      runSeq: s.runSeq,
      requiredWebClientId: !s.vehicleActivation ? s.clientId : null,
      requiredDeviceId: s.vehicleActivation?.deviceId ?? null,
      navigationRequired: !!s.navigation?.attempts.length,
      webAck: null,
      carAck: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      newRunId: null,
    };
    // No grant has been issued for these approvals; the reset gate forbids later dispatch.
    for (const a of s.navigation?.attempts || [])
      if (a.dispatch === "not_started" && a.outcome === "pending")
        a.outcome = "not_dispatched";
    return;
  }
  const r = s.reset,
    p = c.payload;
  if (!r || r.id !== c.target.resetId)
    fail(409, "STALE_STATE", "현재 초기화 요청이 아니에요.");
  if (c.actor === "web") {
    if (r.requiredWebClientId !== id || p.webClientId !== id)
      fail(403, "ACTOR_FORBIDDEN", "초기화 대상 모바일이 아니에요.");
    r.webAck = { commandId: c.commandId, payload: structuredClone(p) };
    return;
  }
  if (
    c.actor !== "car" ||
    r.requiredDeviceId !== p.deviceId ||
    p.deviceId !== s.vehicle.deviceId
  )
    fail(403, "ACTOR_FORBIDDEN", "실행 차량의 ACK가 필요해요.");
  if (
    p.vehicleSessionId !== s.vehicle.vehicleSessionId ||
    p.vehicleEpoch !== s.vehicle.vehicleEpoch ||
    !fresh(s, now) ||
    !s.vehicle.foreground
  )
    fail(409, "STALE_STATE", "현재 활성 차량 세션에서 다시 확인해 주세요.");
  if (
    p.pendingAttemptIds.length ||
    pending(s) ||
    s.navigation?.owned ||
    s.recovery
  )
    fail(
      423,
      "RECOVERY_REQUIRED",
      "실행 중이거나 미정리인 내비 작업이 남아 있어요.",
    );
  if (r.navigationRequired) {
    if (
      !parked(s, now) ||
      s.social.testRestricted ||
      s.vehicle.navigationSource !== "real" ||
      !p.evidence ||
      !cleanBaseline(s, p.evidence, now)
    )
      fail(
        423,
        "RECOVERY_REQUIRED",
        "현재 실제 내비의 원래 목적지·기준 경유지 확인이 필요해요.",
      );
    const dispatched = s.navigation.attempts.some(
      (a) => a.dispatch === "may_have_executed",
    );
    if (dispatched && !p.journal)
      fail(423, "RECOVERY_REQUIRED", "차량 실행 기록 확인이 필요해요.");
    if (p.journal) {
      const j = p.journal,
        a = s.navigation.attempts.find((a) => a.attemptId === j.attemptId),
        report = a?.reports.find((x) => x.reportId === j.reportId);
      if (
        j.scope !== `${s.storeId}:${s.runId}:${p.deviceId}` ||
        !a ||
        !report ||
        report.outcome !== j.outcome ||
        a.outcome !== j.outcome ||
        !["removed", "not_dispatched"].includes(j.outcome) ||
        (j.outcome === "not_dispatched" && j.sdkCalls !== 0)
      )
        fail(
          423,
          "RECOVERY_REQUIRED",
          "현재 회차의 종료된 SDK 기록과 ACK가 일치하지 않아요.",
        );
    }
  } else if (p.evidence !== null || p.journal !== null)
    fail(
      400,
      "INVALID_PAYLOAD",
      "실제 작업이 없는 회차에 가짜 경로 증빙을 넣을 수 없어요.",
    );
  r.carAck = { commandId: c.commandId, payload: structuredClone(p) };
}
export function finishReset(s, createInitial) {
  const r = s.reset;
  if (
    !r ||
    s.recovery ||
    pending(s) ||
    s.navigation?.owned ||
    (r.requiredWebClientId && !r.webAck) ||
    (r.requiredDeviceId && !r.carAck)
  )
    return s;
  const next = createInitial();
  next.storeId = s.storeId;
  next.runSeq = s.runSeq + 1;
  next.version = s.version;
  next.vehicle.vehicleEpoch = s.vehicle.vehicleEpoch;
  r.completedAt = new Date().toISOString();
  r.newRunId = next.runId;
  // Keep only reset/navigation audit material; onboarding/profile drafts are not archived.
  const receipts = Object.fromEntries(
    Object.entries(s.receipts).filter(
      ([, v]) =>
        v.command.type.startsWith("NAV_") ||
        v.command.type.startsWith("RESET_"),
    ),
  );
  next.resetHistory = [
    ...(s.resetHistory || []),
    {
      runId: s.runId,
      runSeq: s.runSeq,
      reset: structuredClone(r),
      navigation: structuredClone(s.navigation ?? null),
      vehicle: structuredClone(s.vehicle),
      vehicleActivation: structuredClone(s.vehicleActivation),
      receipts,
    },
  ];
  next.lateNavigationFacts = s.lateNavigationFacts || [];
  return next;
}
export function findReceipt(s, key) {
  return (
    s.receipts[key] ||
    (s.resetHistory || []).find((a) => a.receipts[key])?.receipts[key]
  );
}
export function applyArchivedReport(s, c) {
  const old = s.resetHistory?.find(
      (a) => a.runId === c.runId && a.runSeq === c.runSeq,
    ),
    p = c.payload;
  const a = old?.navigation?.attempts.find((a) => a.attemptId === p.attemptId);
  if (
    !a ||
    c.actor !== "car" ||
    a.executionRecordId !== p.executionRecordId ||
    !(
      (p.vehicleSessionId === old.vehicle.vehicleSessionId &&
        p.vehicleEpoch === old.vehicle.vehicleEpoch) ||
      (s.vehicle.deviceId === a.deviceId &&
        p.vehicleSessionId === s.vehicle.vehicleSessionId &&
        p.vehicleEpoch === s.vehicle.vehicleEpoch)
    )
  )
    fail(
      409,
      "RUN_CHANGED",
      "이전 회차의 알려진 실행 사실만 기록할 수 있어요.",
    );
  const prior = a.reports.find((r) => r.reportId === p.reportId);
  if (prior) {
    if (
      !equal(prior, {
        reportId: p.reportId,
        outcome: p.outcome,
        evidence: p.evidence,
      })
    )
      fail(400, "COMMAND_ID_REUSED", "기존 보고 내용을 바꿀 수 없어요.");
    return;
  }
  if (
    p.outcome === "not_dispatched"
      ? p.evidence !== null
      : p.outcome !== "unknown" &&
        (!p.evidence ||
          !validEvidence(p.evidence, a.dispatchAt, a.sdkSessionId) ||
          !pointEqual(p.evidence.second.destination, a.baseline))
  )
    fail(409, "NAV_NOT_READY", "이전 실행의 실제 관측이 필요해요.");
  const late = s.lateNavigationFacts?.find(
    (f) =>
      f.command.runId === c.runId &&
      f.command.payload.attemptId === p.attemptId &&
      f.command.payload.reportId === p.reportId,
  );
  if (late) {
    if (!equal(late.command.payload, p))
      fail(400, "COMMAND_ID_REUSED", "늦은 보고 ID의 내용을 바꿀 수 없어요.");
    return;
  }
  if (
    (p.outcome === "applied" &&
      (a.operation !== "add" ||
        p.evidence.second.waypoints.length !== 1 ||
        p.evidence.second.waypoints[0].poiId !== place.poiId)) ||
    (p.outcome === "removed" &&
      (a.operation !== "remove" || p.evidence.second.waypoints.length !== 0)) ||
    (p.outcome === "unknown" && a.dispatch !== "may_have_executed")
  )
    fail(
      409,
      "NAV_NOT_READY",
      "이전 실행의 종류와 실제 결과가 일치하지 않아요.",
    );
  const finalEvidence = old.reset.carAck?.payload.evidence;
  const older =
    p.evidence &&
    finalEvidence &&
    p.evidence.second.sessionId === finalEvidence.second.sessionId &&
    p.evidence.second.completedAt <= finalEvidence.second.completedAt;
  const requiresRecovery = !older;
  (s.lateNavigationFacts ??= []).push({
    command: structuredClone(c),
    requiresRecovery,
  });
  if (requiresRecovery)
    s.recovery = {
      runId: c.runId,
      attemptId: a.attemptId,
      message:
        "이전 회차의 늦은 SDK 사실이 도착했어요. 실제 경로 복구 확인이 필요해요.",
    };
}
