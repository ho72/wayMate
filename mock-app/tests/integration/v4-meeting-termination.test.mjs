import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "../helpers/v4-fixture.mjs";

async function cancel(f, kind) {
  return kind === "A_cancel"
    ? f.act("MEETING_CANCEL", "car")
    : f.respond("meeting", kind === "B_reject" ? "reject" : "cancel");
}
for (const kind of ["A_cancel", "B_reject", "B_cancel"]) {
  test(`${kind} ends the connection, hides the peer and permits withdrawal without losing the acknowledged trip`, async (t) => {
    const f = await fixture(t);
    await f.connect();
    await f.activate();
    await f.act("MEETING_PROPOSE", "car");
    const target = (await f.read("operator")).social.pendingResponses.find(
      (x) => x.kind === "meeting",
    );
    if (kind !== "B_reject") await f.respond("meeting", "accept");
    const before = await f.read("car");
    const result = await cancel(f, kind);
    async function check() {
      const s = await f.read("car");
      assert.equal(s.social.connection.status, "ended");
      assert.equal(
        s.social.connection.version,
        before.social.connection.version + 1,
      );
      assert.equal(
        s.social.meeting.status,
        kind === "B_reject" ? "declined" : "cancelled",
      );
      assert.equal(s.social.meeting.aConsent, false);
      assert.equal(s.social.meeting.bConsent, false);
      assert.equal(s.social.peer, null);
      assert.equal((await f.read("web")).social.peer, null);
      assert.equal(s.content, null);
      assert.equal(s.journey.phase, "early_end");
      assert.ok(s.actionBindings.PROFILE_PRIVATE);
      assert.equal(s.actionBindings.MEETING_PROPOSE, undefined);
      assert.equal(s.social.cleanupRequired, false);
      assert.deepEqual(s.activeJourney, before.activeJourney);
      assert.deepEqual(s.handoff, before.handoff);
      assert.deepEqual(s.navigation?.attempts, before.navigation?.attempts);
      assert.equal(
        (await f.read("operator")).social.pendingResponses.some(
          (x) => x.kind === "meeting",
        ),
        false,
      );
    }
    await check();
    await f.restart();
    await check();
    await assert.rejects(
      f.send("B_RESPONSE", { decision: "accept" }, "operator", target),
    );
    const stored = JSON.parse(await readFile(f.file));
    const original =
      stored.receipts[
        `${stored.runId}:${kind === "A_cancel" ? "car" : "operator"}:${result.receipt.commandId}`
      ];
    assert.ok(original);
    await f.post(original.command);
    await check();
    await f.act("PROFILE_PRIVATE", "car");
    assert.equal((await f.read("web")).publication, "private");
  });
}
for (const kind of ["A_cancel", "B_cancel"]) {
  test(`${kind} preserves an unknown physical operation and its late applied result until separate removal approval`, async (t) => {
    const f = await fixture(t);
    await f.connect();
    await f.activate();
    await f.meeting();
    const approval = await f.navApprove();
    const dispatch = await f.dispatch(approval.state.navigation.attempts[0]);
    const attempt = dispatch.state.navigation.attempts[0];
    await f.report(attempt, "unknown", f.evidence([], attempt.dispatchAt));
    const before = (await f.read("car")).navigation;
    await cancel(f, kind);
    await f.restart();
    let s = await f.read("car");
    assert.equal(s.social.connection.status, "ended");
    assert.equal(s.social.peer, null);
    assert.equal(s.navigation.attempts[0].outcome, "unknown");
    assert.deepEqual(s.navigation.attempts, before.attempts);
    await assert.rejects(f.navApprove());
    await f.report(attempt, "applied", f.evidence([f.m], attempt.dispatchAt));
    s = await f.read("car");
    assert.equal(s.social.cleanupRequired, true);
    assert.ok(s.navigation.owned);
    assert.equal(s.navigation.attempts.length, 1);
    const removal = await f.navApprove("remove", f.evidence([f.m], 3000));
    const removalDispatch = await f.dispatch(
      removal.state.navigation.attempts.at(-1),
    );
    const removing = removalDispatch.state.navigation.attempts.at(-1);
    await f.report(removing, "removed", f.evidence([], removing.dispatchAt));
    s = await f.read("car");
    assert.equal(s.social.connection.status, "ended");
    assert.equal(s.social.cleanupRequired, false);
    assert.equal(s.navigation.owned, null);
  });
  test(`${kind} preserves mock unknown/owned waypoints and the original destination until explicit cleanup`, async (t) => {
    const f = await fixture(t);
    await f.connect();
    await f.activate("connected", "mock");
    await f.meeting();
    await f.act("NAV_APPROVE", "car");
    const initial = (await f.read("car")).mockNavigation;
    const attempt = initial.attempts[0];
    const result = (outcome) =>
      f.send("NAV_MOCK_RESULT", { outcome }, "operator", {
        attemptId: attempt.attemptId,
        operation: "add",
      });
    await result("unknown");
    await cancel(f, kind);
    await f.restart();
    let s = await f.read("car");
    assert.equal(s.social.connection.status, "ended");
    assert.equal(s.social.peer, null);
    assert.equal(s.mockNavigation.attempts[0].outcome, "unknown");
    assert.equal(s.actionBindings.NAV_RETRY_ADD, undefined);
    assert.deepEqual(s.mockNavigation.route, initial.route);
    await result("applied");
    s = await f.read("car");
    assert.equal(s.social.cleanupRequired, true);
    assert.equal(s.mockNavigation.route.waypoints.length, 1);
    await f.act("NAV_REMOVE_APPROVE", "car");
    const removal = (await f.read("car")).mockNavigation.attempts.at(-1);
    await f.send("NAV_MOCK_RESULT", { outcome: "removed" }, "operator", {
      attemptId: removal.attemptId,
      operation: "remove",
    });
    s = await f.read("car");
    assert.equal(s.social.cleanupRequired, false);
    assert.equal(s.mockNavigation.owned, null);
    assert.deepEqual(
      s.mockNavigation.route.destination,
      initial.route.destination,
    );
    assert.deepEqual(s.mockNavigation.route.waypoints, []);
  });
}
