import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateStore } from "../../server/v4/state.mjs";
import { fixture } from "../helpers/v4-fixture.mjs";

async function setup(t) {
  const f = await fixture(t);
  await f.connect();
  await f.activate("connected", "mock");
  await f.meeting();
  return f;
}
const latest = async (f) =>
  (await f.read("car")).mockNavigation.attempts.at(-1);
async function result(f, outcome, a) {
  a ??= await latest(f);
  return f.send("NAV_MOCK_RESULT", { outcome }, "operator", {
    attemptId: a.attemptId,
    operation: a.operation,
  });
}
test("mock approval needs consent; operator result alone changes the mock route, never real evidence", async (t) => {
  const f = await setup(t),
    before = await f.read("car");
  await f.act("NAV_APPROVE", "car");
  let s = await f.read("car");
  assert.equal(s.mockNavigation.attempts[0].outcome, "pending");
  assert.deepEqual(s.mockNavigation.route.waypoints, []);
  assert.equal(s.navigation, undefined);
  assert.equal((await f.read("web")).mockNavigation, null);
  const a = await latest(f);
  await assert.rejects(
    f.send("NAV_MOCK_RESULT", { outcome: "applied" }, "car", {
      attemptId: a.attemptId,
      operation: "add",
    }),
  );
  await result(f, "applied");
  s = await f.read("car");
  assert.equal(s.mockNavigation.route.waypoints.length, 1);
  assert.deepEqual(
    s.mockNavigation.route.destination,
    before.mockNavigation.route.destination,
  );
  assert.equal(s.navigation, undefined);
  await assert.rejects(result(f, "failed", a));
});
test("failed add requires a fresh explicit retry and keeps the failed record immutable", async (t) => {
  const f = await setup(t);
  await f.act("NAV_APPROVE", "car");
  const a = await latest(f);
  await result(f, "failed");
  let s = await f.read("car");
  assert.deepEqual(s.mockNavigation.route.waypoints, []);
  assert.equal(s.mockNavigation.attempts.length, 1);
  await f.act("NAV_RETRY_ADD", "car");
  const b = await latest(f);
  assert.notEqual(b.attemptId, a.attemptId);
  assert.equal(b.previousAttemptId, a.attemptId);
  await result(f, "applied");
  s = await f.read("car");
  assert.equal(s.mockNavigation.attempts[0].outcome, "failed");
  assert.equal(s.mockNavigation.attempts.length, 2);
});
test("unknown retains last route and locks retry/meeting until a later operator result", async (t) => {
  const f = await setup(t);
  await f.act("NAV_APPROVE", "car");
  await result(f, "unknown");
  let s = await f.read("car"),
    a = await latest(f);
  assert.equal(s.recovery, null);
  assert.deepEqual(s.mockNavigation.route.waypoints, []);
  assert.equal(s.actionBindings.NAV_RETRY_ADD, undefined);
  assert.equal(
    (await f.read("operator")).actionBindings.MEETING_START,
    undefined,
  );
  await assert.rejects(
    f.send(
      "NAV_RETRY",
      {
        source: "mock",
        operation: "add",
        ...(await f.common()),
        reviewedRouteRevision: 0,
        ownedAttemptId: null,
      },
      "car",
      { attemptId: a.attemptId },
    ),
  );
  await result(f, "applied");
  s = await f.read("car");
  assert.deepEqual(
    s.mockNavigation.attempts[0].results.map((x) => x.outcome),
    ["unknown", "applied"],
  );
  assert.ok((await f.read("operator")).actionBindings.MEETING_START);
});
test("cancellation never discards a late mock applied result; separate removal preserves destination", async (t) => {
  const f = await setup(t);
  await f.act("NAV_APPROVE", "car");
  await f.act("MEETING_CANCEL", "car");
  await result(f, "applied");
  let s = await f.read("car");
  assert.equal(s.social.meeting.status, "cancelled");
  assert.equal(s.social.cleanupRequired, true);
  const d = structuredClone(s.mockNavigation.route.destination);
  await f.act("NAV_REMOVE_APPROVE", "car");
  await result(f, "failed");
  assert.equal((await f.read("car")).mockNavigation.route.waypoints.length, 1);
  await f.act("NAV_RETRY_REMOVE", "car");
  await result(f, "removed");
  s = await f.read("car");
  assert.deepEqual(s.mockNavigation.route.destination, d);
  assert.deepEqual(s.mockNavigation.route.waypoints, []);
  assert.equal(s.mockNavigation.owned, null);
});
test("O01 waits for unknown, explicit removal, and the actual current car ACK", async (t) => {
  const f = await setup(t);
  await f.act("NAV_APPROVE", "car");
  await result(f, "unknown");
  await f.act("RESET_BEGIN", "operator");
  let s = await f.read("car");
  const run = s.runId;
  assert.equal(s.reset.canAcknowledge, false);
  assert.equal(s.reset.navigationRequired, false);
  await result(f, "applied");
  await f.act("NAV_REMOVE_APPROVE", "car");
  await result(f, "unknown");
  assert.equal((await f.read("car")).reset.canAcknowledge, false);
  await result(f, "removed");
  await f.act("RESET_ACK", "car");
  s = await f.read("car");
  assert.notEqual(s.runId, run);
  assert.equal(s.reset, null);
  assert.equal(s.mockNavigation, null);
  const store = JSON.parse(await readFile(f.file));
  assert.equal(store.resetHistory.at(-1).mockNavigation.attempts.length, 2);
  assert.equal(
    store.resetHistory.at(-1).mockNavigation.attempts[0].results[0].outcome,
    "unknown",
  );
});
test("mock results cannot target a real attempt, switch away from real work, or unlock recovery", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  await f.navApprove();
  const before = (await f.read("car")).navigation,
    a = before.attempts[0];
  await assert.rejects(result(f, "applied", a));
  await assert.rejects(f.send("NAV_MOCK_CONTINUE", {}, "operator"));
  await assert.rejects(
    f.send(
      "CAR_SESSION_OPEN",
      {
        deviceId: f.device,
        vehicleSessionId: randomUUID(),
        pendingAttempts: [],
        navigationSource: "mock",
      },
      "car",
    ),
  );
  await assert.rejects(
    f.send(
      "RECOVERY_CONFIRM",
      { recoveryProcedureId: "unregistered", evidenceId: randomUUID() },
      "operator",
      { attemptIds: [a.attemptId] },
    ),
    (e) => e.code === "RECOVERY_REQUIRED",
  );
  assert.deepEqual((await f.read("car")).navigation, before);
  assert.deepEqual((await f.read("operator")).recoveryStatus.procedures, []);
});
test("facts may arrive under restriction but do not unlock progression; duplicate result replays once", async (t) => {
  const f = await setup(t);
  await f.act("NAV_APPROVE", "car");
  const a = await latest(f);
  await f.send("SET_TEST_RESTRICTION", { enabled: true }, "operator");
  const c = await f.envelope(
    "NAV_MOCK_RESULT",
    { outcome: "applied" },
    "operator",
    { attemptId: a.attemptId, operation: a.operation },
  );
  await f.post(c);
  assert.equal((await f.post(c)).receipt.replayed, true);
  const s = await f.read("car");
  assert.equal(s.mockNavigation.route.revision, 1);
  assert.equal(s.social.testRestricted, true);
  assert.equal(
    (await f.read("operator")).actionBindings.MEETING_START,
    undefined,
  );
  await f.send("SET_TEST_RESTRICTION", { enabled: false }, "operator");
  assert.ok((await f.read("operator")).actionBindings.MEETING_START);
});
test("mock route supports independent final choice and replay without another navigation attempt", async (t) => {
  const f = await setup(t);
  await f.act("NAV_APPROVE", "car");
  await result(f, "applied");
  await f.act("MEETING_START", "operator");
  await f.act("MEETING_END", "operator");
  await f.act("FINAL_CHOOSE_TOGETHER", "car");
  await f.act("B_FINAL_MY_AGENT", "operator");
  const before = (await f.read("car")).mockNavigation;
  await f.act("REPLAY_FINAL", "operator");
  const s = await f.read("car");
  assert.equal(s.actionBindings.NAV_APPROVE, undefined);
  assert.deepEqual(s.mockNavigation, before);
  await assert.rejects(
    f.send(
      "NAV_RETRY",
      {
        source: "mock",
        operation: "add",
        ...(await f.common()),
        reviewedRouteRevision: 1,
        ownedAttemptId: before.owned.attemptId,
      },
      "car",
      { attemptId: before.owned.attemptId },
    ),
    (e) => e.code === "REPLAY_ONLY",
  );
});

test("mock unknown survives server restart; wrong operation, old revision and settled targets fail", async (t) => {
  const f = await setup(t);
  const approval = await f.envelope(
    "NAV_APPROVE",
    (await f.read("car")).actionBindings.NAV_APPROVE.payload,
    "car",
    (await f.read("car")).actionBindings.NAV_APPROVE.target,
  );
  await f.post(approval);
  const a = await latest(f);
  await result(f, "unknown");
  await f.restart();
  assert.equal((await latest(f)).outcome, "unknown");
  await assert.rejects(
    f.send("NAV_MOCK_RESULT", { outcome: "removed" }, "operator", {
      attemptId: a.attemptId,
      operation: "remove",
    }),
  );
  await result(f, "applied");
  await f.act("MEETING_CANCEL", "car");
  const binding = (await f.read("car")).actionBindings.NAV_REMOVE_APPROVE;
  await assert.rejects(
    f.send(
      binding.commandType,
      { ...binding.payload, reviewedRouteRevision: 0 },
      "car",
      binding.target,
    ),
  );
  await f.act("NAV_REMOVE_APPROVE", "car");
  await result(f, "unknown");
  assert.equal(
    (await f.read("car")).actionBindings.NAV_RETRY_REMOVE,
    undefined,
  );
  await result(f, "failed");
  await f.act("NAV_RETRY_REMOVE", "car");
  await result(f, "removed");
  assert.equal((await f.read("car")).mockNavigation.route.revision, 2);
  await assert.rejects(result(f, "applied", a));
  assert.equal((await f.post(approval)).receipt.replayed, true);
  assert.equal((await f.read("car")).mockNavigation.attempts.length, 3);
});

test("mock execution cancellation is a stop action and cannot rewrite an unknown result", async (t) => {
  const f = await setup(t);
  await f.act("NAV_APPROVE", "car");
  await f.send("SET_TEST_RESTRICTION", { enabled: true }, "operator");
  await f.act("NAV_CANCEL", "car");
  assert.equal((await latest(f)).outcome, "not_dispatched");
  await assert.rejects(result(f, "applied"));
  await f.send("SET_TEST_RESTRICTION", { enabled: false }, "operator");
  await f.act("NAV_RETRY_ADD", "car");
  await result(f, "unknown");
  assert.equal((await f.read("car")).actionBindings.NAV_CANCEL, undefined);
});

test("explicit mock continuation preserves real not-dispatched history", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  await f.navApprove();
  const a = (await f.read("car")).navigation.attempts.at(-1);
  await f.send(
    "NAV_CANCEL",
    { ...(await f.common()), attemptId: a.attemptId },
    "car",
  );
  const before = (await f.read("car")).navigation;
  await f.act("NAV_MOCK_CONTINUE", "operator");
  const after = await f.read("car");
  assert.equal(after.navigationMode, "mock");
  assert.deepEqual(after.navigation, before);
  assert.equal(after.mockNavigation.attempts.length, 0);
  await assert.rejects(result(f, "applied", a));
});

test("corrupted mock route, ownership and result history are rejected on restoration", async (t) => {
  const f = await setup(t);
  await f.act("NAV_APPROVE", "car");
  await result(f, "applied");
  const original = JSON.parse(await readFile(f.file));
  for (const mutate of [
    (s) => s.mockNavigation.route.revision++,
    (s) => (s.mockNavigation.attempts[0].results = []),
    (s) => (s.mockNavigation.route.waypoints = []),
    (s) => (s.mockNavigation.attempts[0].ownedAttemptId = randomUUID()),
  ]) {
    const s = structuredClone(original);
    mutate(s);
    assert.throws(() => validateStore(s));
  }
});
