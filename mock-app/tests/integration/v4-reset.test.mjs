import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fixture } from "../helpers/v4-fixture.mjs";
import { coordinator } from "../../server/v4/commands.mjs";

async function begin(f) {
  const s = await f.read("operator");
  return f.send("RESET_BEGIN", {}, "operator", { runId: s.runId });
}
async function observe(f, e = f.evidence([], 5000)) {
  await f.send(
    "NAV_OBSERVE",
    { ...(await f.common()), source: "real", evidence: e },
    "car",
  );
  return e;
}
async function ackCommand(f, e = null, overrides = {}) {
  const s = await f.read("car"),
    a = s.navigation?.attempts.at(-1),
    r = a?.reports.at(-1);
  const journal =
    r && ["removed", "not_dispatched"].includes(r.outcome)
      ? {
          scope: `${s.storeId}:${s.runId}:${f.device}`,
          attemptId: a.attemptId,
          reportId: r.reportId,
          outcome: r.outcome,
          acknowledged: true,
          sdkCalls: r.outcome === "removed" ? 1 : 0,
        }
      : null;
  return f.envelope(
    "RESET_ACK",
    {
      deviceId: f.device,
      ...(await f.common()),
      cleared: { ui: true, audio: true, pendingRequests: true },
      pendingAttemptIds: [],
      evidence: e,
      journal,
      ...overrides,
    },
    "car",
    { resetId: s.reset.id },
  );
}
async function applied(f) {
  const r = await f.navApprove(),
    d = await f.dispatch(r.state.navigation.attempts.at(-1)),
    a = d.state.navigation.attempts.at(-1);
  await f.report(a, "applied", f.evidence([f.m], a.dispatchAt));
  return a;
}
async function remove(f) {
  const s = await f.read("car"),
    e = await observe(f, f.evidence([f.m], 7000));
  const r = await f.send(
    "NAV_REMOVE_APPROVE",
    {
      ...(await f.common()),
      operation: "remove",
      reviewed: e,
      ownedAttemptId: s.navigation.owned.attemptId,
    },
    "car",
    { reason: "reset_cleanup", resetId: s.reset.id },
  );
  const d = await f.dispatch(r.state.navigation.attempts.at(-1)),
    a = d.state.navigation.attempts.at(-1);
  await f.report(a, "removed", f.evidence([], a.dispatchAt));
  return a;
}

test("empty run reset completes atomically and keeps store identity", async (t) => {
  const f = await fixture(t),
    before = await f.read(),
    r = await begin(f);
  assert.equal(r.state.runSeq, before.runSeq + 1);
  assert.notEqual(r.state.runId, before.runId);
  assert.equal(r.state.storeId, before.storeId);
  assert.equal(r.state.reset, null);
  assert.equal(r.state.vehicle.restrictionKnown, false);
});

test("web-only reset waits for the owning browser cleanup and rejects late old commands", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  const old = await f.read(),
    late = await f.envelope("HANDOFF_PREPARE", { mode: "my_trip" });
  await begin(f);
  const wait = await f.read();
  assert.equal(wait.runId, old.runId);
  assert.equal(wait.reset.requiredWebClientId, f.id);
  assert.equal(wait.reset.requiredDeviceId, null);
  await assert.rejects(f.post(late), { code: "RESETTING" });
  const b = wait.actionBindings.RESET_ACK,
    r = await f.send(b.commandType, b.payload, "web", b.target);
  assert.notEqual(r.state.runId, old.runId);
  assert.equal(r.state.profile, null);
  assert.equal(r.state.clientId, null);
  assert.deepEqual(r.state.onboarding, {});
  assert.equal(r.state.publicApproval.approvedFields.length, 0);
  await assert.rejects(f.post(late), { code: "RUN_CHANGED" });
  const disk = JSON.parse(await readFile(f.file));
  assert.equal(
    JSON.stringify(disk.resetHistory).includes("원문 그대로"),
    false,
  );
});

test("active vehicle reset does not require a closed mobile and persists until vehicle ACK", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  const old = await f.read("car");
  await begin(f);
  await f.restart();
  const s = await f.read("car");
  assert.equal(s.runId, old.runId);
  assert.equal(s.reset.requiredWebClientId, null);
  assert.equal(s.reset.requiredDeviceId, f.device);
  const c = await ackCommand(f);
  const r = await f.post(c);
  assert.equal(r.state.runSeq, old.runSeq + 1);
  assert.equal(r.state.vehicle.fresh, false);
  assert.equal(r.state.vehicle.vehicleSessionId, null);
  assert.equal(r.state.lastCompletedReset.webCleanup, "deferred");
});

test("reset cleanup removes only owned waypoint without cancelling a confirmed meeting", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  await applied(f);
  const before = await f.read("car");
  await begin(f);
  assert.deepEqual((await f.read("car")).social.meeting, before.social.meeting);
  await assert.rejects(f.post(await ackCommand(f)), {
    code: "RECOVERY_REQUIRED",
  });
  const a = await remove(f);
  let s = await f.read("car");
  assert.equal(s.social.meeting.status, "confirmed");
  assert.equal(s.navigation.owned, null);
  assert.equal(s.navigation.attempts.length, 2);
  assert.equal(a.resetId, s.reset.id);
  const e = await observe(f, f.evidence([], 10000)),
    ack = await ackCommand(f, e),
    r = await f.post(ack);
  assert.equal(r.state.runSeq, before.runSeq + 1);
  assert.equal(r.state.navigation, undefined);
  const disk = JSON.parse(await readFile(f.file)),
    history = disk.resetHistory.at(-1);
  assert.equal(history.navigation.attempts[0].outcome, "applied");
  assert.equal(history.navigation.attempts[1].outcome, "removed");
  assert.equal(history.navigation.owned, null);
  assert.equal(
    history.reset.carAck.payload.evidence.second.destination.name,
    "42dot",
  );
  const duplicate = await f.post(ack);
  assert.equal(duplicate.receipt.replayed, true);
  assert.equal(duplicate.state.runId, r.state.runId);
  const receipt = await (await import("../../server/v4/commands.mjs"))
    .coordinator(f.file, disk, { now: () => 10000 })
    .receipt("car", null, ack.runId, ack.commandId);
  assert.equal(receipt.status, "applied");
});

test("unknown dispatched add blocks reset ACK; late add is retained then explicitly removed", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const r = await f.navApprove(),
    d = await f.dispatch(r.state.navigation.attempts[0]),
    a = d.state.navigation.attempts[0];
  await f.report(a, "unknown", null);
  await begin(f);
  const old = (await f.read("car")).runId;
  await assert.rejects(f.post(await ackCommand(f)), {
    code: "RECOVERY_REQUIRED",
  });
  assert.equal((await f.read("car")).reset.status, "needs_recovery");
  await f.report(a, "applied", f.evidence([f.m], a.dispatchAt));
  assert.equal((await f.read("car")).runId, old);
  assert.equal((await f.read("car")).navigation.owned.attemptId, a.attemptId);
  await remove(f);
  const e = await observe(f, f.evidence([], 12000));
  await f.post(await ackCommand(f, e));
  assert.notEqual((await f.read("car")).runId, old);
});

test("reset closes ungranted approvals but never grants their late dispatch", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const r = await f.navApprove(),
    a = r.state.navigation.attempts[0];
  await begin(f);
  assert.equal(
    (await f.read("car")).navigation.attempts[0].outcome,
    "not_dispatched",
  );
  await assert.rejects(f.dispatch(a), { code: "RESETTING" });
  const e = await observe(f, f.evidence([], 9000));
  await f.post(await ackCommand(f, e));
  assert.equal((await f.read("car")).runSeq, 2);
});

test("late never-granted not_dispatched report preserves audit without locking the next run", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const a = (await f.navApprove()).state.navigation.attempts[0],
    old = await f.read("car"),
    common = await f.common();
  await begin(f);
  const e = await observe(f, f.evidence([], 9000));
  await f.post(await ackCommand(f, e));
  const next = await f.read("car");
  const late = await f.envelope(
    "NAV_REPORT",
    {
      ...common,
      attemptId: a.attemptId,
      executionRecordId: null,
      reportId: randomUUID(),
      outcome: "not_dispatched",
      evidence: null,
    },
    "car",
  );
  late.runId = old.runId;
  late.runSeq = old.runSeq;
  for (const change of [
    { executionRecordId: randomUUID() },
    { vehicleSessionId: randomUUID() },
    { outcome: "unknown" },
  ]) {
    const bad = structuredClone(late);
    bad.commandId = randomUUID();
    Object.assign(bad.payload, change);
    await assert.rejects(f.post(bad));
    assert.equal((await f.read("car")).recovery, null);
  }
  const result = await f.post(late);
  assert.equal(result.state.recovery, null);
  assert.equal(result.state.runId, next.runId);
  assert.equal(result.state.navigation, undefined);
  await f.post(late);
  const disk = JSON.parse(await readFile(f.file));
  assert.equal(disk.lateNavigationFacts.length, 1);
  assert.equal(disk.lateNavigationFacts[0].requiresRecovery, false);
  assert.equal(disk.resetHistory[0].navigation.attempts[0].reports.length, 0);
  const restored = coordinator(f.file, JSON.parse(await readFile(f.file)));
  assert.equal((await restored.read("car", null)).recovery, null);
  const reset = await f.envelope("RESET_BEGIN", {}, "operator", {
    runId: next.runId,
  });
  await restored.command(reset, "operator", null);
  assert.equal((await restored.read("car", null)).runSeq, next.runSeq + 1);
});

test("lost web identity cannot bypass the required owner ACK", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  await begin(f);
  const owner = await f.read(),
    foreignId = randomUUID(),
    foreign = await f.read("web", foreignId);
  assert.equal(foreign.reset.requiredWebClientId, f.id);
  assert.equal(foreign.actionBindings.RESET_ACK, undefined);
  assert.equal(foreign.runId, owner.runId);
  await assert.rejects(
    f.send(
      "RESET_ACK",
      {
        webClientId: foreignId,
        cleared: { ui: true, audio: true, pendingRequests: true },
      },
      "web",
      { resetId: owner.reset.id },
    ),
    { code: "ACTOR_FORBIDDEN" },
  );
  assert.equal((await f.read()).runId, owner.runId);
  const b = owner.actionBindings.RESET_ACK;
  await f.send(b.commandType, b.payload, "web", b.target);
  assert.equal((await f.read()).runSeq, owner.runSeq + 1);
});

test("reset rejects wrong reset/device/session, claimed pending work, stale and changed baseline proof", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  await applied(f);
  await begin(f);
  await remove(f);
  const e = await observe(f, f.evidence([], 12000));
  const c = await ackCommand(f, e);
  for (const patch of [
    { deviceId: randomUUID() },
    { vehicleSessionId: randomUUID() },
    { vehicleEpoch: c.payload.vehicleEpoch + 1 },
    { pendingAttemptIds: [randomUUID()] },
    { journal: null },
  ]) {
    const bad = structuredClone(c);
    bad.commandId = randomUUID();
    Object.assign(bad.payload, patch);
    await assert.rejects(f.post(bad));
  }
  const wrong = structuredClone(c);
  wrong.commandId = randomUUID();
  wrong.target.resetId = randomUUID();
  await assert.rejects(f.post(wrong), { code: "STALE_STATE" });
  const changed = f.evidence([], 14000);
  changed.first.destination.latitude += 1;
  changed.second.destination.latitude += 1;
  await observe(f, changed);
  await assert.rejects(f.post(await ackCommand(f, changed)), {
    code: "RECOVERY_REQUIRED",
  });
  await observe(f, f.evidence([], 16000));
  f.expire();
  await assert.rejects(f.post(await ackCommand(f, e)));
  assert.equal((await f.read("car")).runSeq, 1);
});

test("restriction blocks reset removal and real cleanup ACK, without hiding cleanup state", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  await applied(f);
  await begin(f);
  const s = await f.read("car"),
    e = await observe(f, f.evidence([f.m], 7000));
  await f.send("SET_TEST_RESTRICTION", { enabled: true }, "operator");
  await assert.rejects(
    f.send(
      "NAV_REMOVE_APPROVE",
      {
        ...(await f.common()),
        operation: "remove",
        reviewed: e,
        ownedAttemptId: s.navigation.owned.attemptId,
      },
      "car",
      { reason: "reset_cleanup", resetId: s.reset.id },
    ),
    { code: "RESTRICTED" },
  );
  await f.send("SET_TEST_RESTRICTION", { enabled: false }, "operator");
  await f.send(
    "CAR_STATUS",
    {
      vehicleSessionId: (await f.common()).vehicleSessionId,
      statusSeq: 999,
      restrictionKnown: true,
      restricted: true,
      foreground: true,
      uiContext: "navigation",
    },
    "car",
  );
  await assert.rejects(
    f.send(
      "NAV_REMOVE_APPROVE",
      {
        ...(await f.common()),
        operation: "remove",
        reviewed: e,
        ownedAttemptId: s.navigation.owned.attemptId,
      },
      "car",
      { reason: "reset_cleanup", resetId: s.reset.id },
    ),
  );
  assert.equal((await f.read("car")).runSeq, 1);
});

test("old SDK replay cannot produce another grant or resurrect business state after reset", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  await applied(f);
  const disk = JSON.parse(await readFile(f.file)),
    grant = Object.values(disk.receipts).find(
      (v) => v.command.type === "NAV_DISPATCH_BEGIN",
    ).command;
  await begin(f);
  await remove(f);
  const e = await observe(f, f.evidence([], 12000));
  await f.post(await ackCommand(f, e));
  const r = await f.post(grant);
  assert.equal(r.receipt.replayed, true);
  assert.equal(r.execution, undefined);
  assert.equal(r.state.social.meeting.status, "none");
});

test("new conflicting fact from known archived SDK attempt is retained and locks the new run", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const a = await applied(f),
    common = await f.common(),
    old = await f.read("car");
  await begin(f);
  await remove(f);
  const e = await observe(f, f.evidence([], 12000));
  await f.post(await ackCommand(f, e));
  const c = await f.envelope(
    "NAV_REPORT",
    {
      ...common,
      attemptId: a.attemptId,
      executionRecordId: a.executionRecordId,
      reportId: randomUUID(),
      outcome: "unknown",
      evidence: null,
    },
    "car",
  );
  c.runId = old.runId;
  c.runSeq = old.runSeq;
  const r = await f.post(c);
  assert.equal(r.state.recovery.attemptId, a.attemptId);
  assert.equal(r.state.social.meeting.status, "none");
  assert.equal(r.state.allowedActions.length, 0);
  const disk = JSON.parse(await readFile(f.file));
  assert.equal(disk.lateNavigationFacts.length, 1);
  assert.equal(disk.resetHistory[0].navigation.owned, null);
});

test("receipt caching preserves every audit entry and rejects a replaced or mutated receipt", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  const disk = JSON.parse(await readFile(f.file)),
    keys = Object.keys(disk.receipts);
  const { validateStore } = await import("../../server/v4/state.mjs");
  validateStore(disk);
  const key = keys[0];
  assert.throws(() => {
    disk.receipts[key].command.type = "RESET_BEGIN";
  }, TypeError);
  const next = {
    ...structuredClone({ ...disk, receipts: {} }),
    receipts: { ...disk.receipts },
  };
  validateStore(next);
  assert.deepEqual(Object.keys(next.receipts), keys);
  next.receipts[key] = structuredClone(disk.receipts[key]);
  next.receipts[key].receipt.committedVersion = next.version + 100;
  assert.throws(() => validateStore(next));
});

test("mutating a caller command after commit cannot change an immutable idempotency receipt", async (t) => {
  const f = await fixture(t),
    c = await f.envelope("ONBOARDING_ANSWER", {
      questionId: "interests",
      answerText: "원래 답변",
      inputSource: "typed",
    });
  await f.post(c);
  c.payload.answerText = "바뀐 답변";
  await assert.rejects(f.post(c), { code: "COMMAND_ID_REUSED" });
  assert.equal((await f.read()).onboarding.interests.answerText, "원래 답변");
});

test("completed SDK audit is immutable across another reset and rejects changed cleanup evidence", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  await applied(f);
  await begin(f);
  await remove(f);
  const e = await observe(f, f.evidence([], 12000));
  await f.post(await ackCommand(f, e));
  let disk = JSON.parse(await readFile(f.file));
  const archived = JSON.stringify(disk.resetHistory[0]);
  await begin(f);
  disk = JSON.parse(await readFile(f.file));
  assert.equal(JSON.stringify(disk.resetHistory[0]), archived);
  const { validateStore } = await import("../../server/v4/state.mjs");
  validateStore(disk);
  assert.throws(() => {
    disk.resetHistory[0].navigation.attempts[0].baseline.name = "changed";
  }, TypeError);
  const bad = JSON.parse(JSON.stringify(disk));
  bad.resetHistory[0].navigation.attempts[0].baseline.latitude += 1;
  assert.throws(() => validateStore(bad));
  for (const history of [null, 0, {}])
    assert.throws(() => validateStore({ ...disk, resetHistory: history }));
});
