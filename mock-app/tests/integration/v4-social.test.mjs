import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { coordinator } from "../../server/v4/commands.mjs";
import { initialState, validateStore } from "../../server/v4/state.mjs";
import { emptySummary } from "../../shared/config/protocol.mjs";
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-v4-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "state.json");
  let clock = 10000,
    app = coordinator(file, initialState(), { now: () => clock });
  const id = randomUUID(),
    session = randomUUID(),
    device = randomUUID(),
    sdk = randomUUID();
  let seq = 0,
    q = 0;
  const read = (a = "web", client = id) =>
    app.read(a, a === "web" ? client : null);
  const envelope = async (type, payload = {}, actor = "web", target = {}) => {
    const s = await read(actor);
    return {
      schemaVersion: 4,
      runSeq: s.runSeq,
      runId: s.runId,
      commandId: randomUUID(),
      expectedVersion: s.version,
      actor,
      type,
      target,
      payload,
    };
  };
  const post = (c) => app.command(c, c.actor, c.actor === "web" ? id : null);
  const send = async (type, payload = {}, actor = "web", target = {}) =>
    post(await envelope(type, payload, actor, target));
  const act = async (name, a = "web") => {
    const b = (await read(a)).actionBindings[name];
    assert.ok(b, `binding ${name}`);
    return send(b.commandType, b.payload, a, b.target);
  };
  const prepare = async () => {
    for (const questionId of [
      "interests",
      "activity",
      "conversation",
      "expression",
    ])
      await send("ONBOARDING_ANSWER", {
        questionId,
        answerText: "원문 그대로 ㅋㅋ",
        inputSource: "typed",
      });
    await send("PROFILE_CONFIRM", {
      alias: "파도",
      avatarId: "a-01",
      confirmedSummary: emptySummary(),
    });
    await send("TRIP_SAVE", {
      presetId: "gangneung-01",
      shareSummaryApproved: false,
    });
  };
  const publish = async () => {
    await act("PROFILE_PUBLISH");
    await act("TRIP_SHARE_CONFIRM");
  };
  const respond = async (kind, decision) => {
    const pending = (await read("operator")).social.pendingResponses.find(
      (r) => r.kind === kind,
    );
    assert.ok(pending);
    return send("B_RESPONSE", { decision }, "operator", pending);
  };
  const connect = async () => {
    await prepare();
    await publish();
    await act("CONNECT_REQUEST");
    await respond("connection", "accept");
    await act("CONFIRM_WINDOW");
  };
  const status = () =>
    send(
      "CAR_STATUS",
      {
        vehicleSessionId: session,
        statusSeq: ++seq,
        restrictionKnown: true,
        restricted: false,
        foreground: true,
        uiContext: "navigation",
      },
      "car",
    );
  const activate = async (mode = "connected") => {
    await send("HANDOFF_PREPARE", { mode });
    await send(
      "CAR_SESSION_OPEN",
      {
        deviceId: device,
        vehicleSessionId: session,
        pendingAttempts: [],
        navigationSource: "real",
      },
      "car",
    );
    await status();
    return act("CAR_LOADED", "car");
  };
  const meeting = async () => {
    await act("MEETING_PROPOSE", "car");
    await respond("meeting", "accept");
  };
  const common = async () => ({
    vehicleSessionId: session,
    vehicleEpoch: (await read("car")).vehicle.vehicleEpoch,
  });
  const d = {
      latitude: 37.48544722,
      longitude: 127.03636666,
      name: "42dot",
      poiId: "",
    },
    m = {
      latitude: 0,
      longitude: 0,
      name: "소프트웨어드림센터",
      poiId: "36khp2hdj2cfcm5nqhe3",
    };
  const evidence = (w = [], after = 0) => {
    const snap = (at) => ({
      sessionId: sdk,
      querySeq: ++q,
      startedAt: at,
      completedAt: at + 100,
      destination: d,
      waypoints: w,
      naviMode: "ROUTE_GUIDING",
      isRouting: false,
    });
    return {
      first: snap(after + 1),
      second: snap(after + 1201),
      lookup: {
        sessionId: sdk,
        receivedAt: 0,
        poiId: m.poiId,
        point: { ...m, latitude: 37.4127749, longitude: 127.0947566 },
      },
    };
  };
  const navApprove = async (op = "add", e = evidence()) => {
    await send(
      "NAV_OBSERVE",
      { ...(await common()), source: "real", evidence: e },
      "car",
    );
    const s = await read("car"),
      target = { proposalId: s.social.meeting.proposalId };
    if (op === "remove") target.reason = "meeting_cancel";
    return send(
      op === "add" ? "NAV_APPROVE" : "NAV_REMOVE_APPROVE",
      {
        ...(await common()),
        operation: op,
        reviewed: e,
        ownedAttemptId: op === "remove" ? s.navigation.owned.attemptId : null,
      },
      "car",
      target,
    );
  };
  const dispatch = async (a) =>
    send(
      "NAV_DISPATCH_BEGIN",
      {
        ...(await common()),
        attemptId: a.attemptId,
        executionRecordId: randomUUID(),
        dispatchAt: a.before.second.completedAt + 1,
      },
      "car",
    );
  const report = async (a, outcome, e) =>
    send(
      "NAV_REPORT",
      {
        ...(await common()),
        attemptId: a.attemptId,
        executionRecordId: a.executionRecordId,
        reportId: randomUUID(),
        outcome,
        evidence: e,
      },
      "car",
    );
  return {
    read,
    envelope,
    post,
    send,
    act,
    prepare,
    publish,
    connect,
    respond,
    activate,
    status,
    meeting,
    common,
    evidence,
    navApprove,
    dispatch,
    report,
    m,
    file,
    id,
    expire: () => (clock += 2100),
    restart: async () => {
      app = coordinator(file, JSON.parse(await readFile(file)), {
        now: () => clock,
      });
      await read("car");
      await status();
    },
  };
}
test("mobile matching works without a vehicle; B accept alone does not link; A confirms exact window", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  assert.equal((await f.read()).social.candidates.length, 0);
  await f.publish();
  assert.equal((await f.read()).social.candidates.length, 3);
  await f.act("CONNECT_REQUEST");
  assert.equal((await f.read()).social.connection.status, "requested");
  await f.respond("connection", "accept");
  assert.equal((await f.read()).social.connection.status, "accepted");
  await assert.rejects(f.send("HANDOFF_PREPARE", { mode: "connected" }));
  await f.act("CONFIRM_WINDOW");
  assert.equal((await f.read()).social.connection.status, "linked");
  assert.equal((await f.read()).vehicle.vehicleSessionId, null);
});
test("car cannot match or read candidates/raw answers; connected ACK validates all source versions", async (t) => {
  const f = await fixture(t);
  await f.connect();
  const s = await f.read();
  const b = s.actionBindings.CONFIRM_WINDOW;
  await assert.rejects(
    f.send(
      "CONNECT_REQUEST",
      { candidateId: "B", sourceVersions: { profile: 1, trip: 1 } },
      "car",
    ),
    { code: "INVALID_PAYLOAD" },
  );
  await f.activate();
  const car = await f.read("car");
  assert.equal(car.social.candidates.length, 0);
  assert.deepEqual(car.onboarding, {});
  assert.equal(car.social.peer.alias, "솔바람");
  assert.equal(car.journeyMode, "connected");
  const h = JSON.parse(await readFile(f.file)).handoff;
  assert.deepEqual(Object.keys(h.sourceVersions).sort(), [
    "connection",
    "profile",
    "publication",
    "trip",
    "tripShare",
  ]);
});
test("meeting needs its own A proposal and current B consent; navigation remains separate", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await assert.rejects(f.navApprove());
  await f.act("MEETING_PROPOSE", "car");
  assert.equal((await f.read("car")).social.meeting.aConsent, true);
  await assert.rejects(f.navApprove());
  await f.respond("meeting", "accept");
  assert.equal((await f.read("car")).social.meeting.status, "confirmed");
  assert.equal((await f.read("car")).navigation?.attempts.length ?? 0, 0);
  const r = await f.navApprove();
  assert.equal(r.state.navigation.attempts[0].context, "meeting");
  assert.equal(r.state.navigation.attempts[0].dispatch, "not_started");
});
test("cancel after approval blocks dispatch; late B accept cannot revive cancelled meeting", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.act("MEETING_PROPOSE", "car");
  const target = (await f.read("operator")).social.pendingResponses[0];
  await f.act("MEETING_CANCEL", "car");
  await assert.rejects(
    f.send("B_RESPONSE", { decision: "accept" }, "operator", target),
  );
  const g = await fixture(t);
  await g.connect();
  await g.activate();
  await g.meeting();
  const r = await g.navApprove(),
    a = r.state.navigation.attempts[0];
  await g.act("MEETING_CANCEL", "car");
  await assert.rejects(g.dispatch(a), { code: "NOT_READY" });
});
test("late physical add preserves cancellation and requires explicit owned removal", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const r = await f.navApprove(),
    b = await f.dispatch(r.state.navigation.attempts[0]),
    a = b.state.navigation.attempts[0];
  await f.act("MEETING_CANCEL", "car");
  await f.report(a, "applied", f.evidence([f.m], a.dispatchAt));
  let s = await f.read("car");
  assert.equal(s.social.meeting.status, "cancelled");
  assert.equal(s.social.cleanupRequired, true);
  await assert.rejects(f.navApprove());
  const removal = await f.navApprove("remove", f.evidence([f.m], 3000)),
    d = await f.dispatch(removal.state.navigation.attempts.at(-1)),
    ra = d.state.navigation.attempts.at(-1);
  await f.report(ra, "removed", f.evidence([], ra.dispatchAt));
  s = await f.read("car");
  assert.equal(s.social.cleanupRequired, false);
  assert.equal(s.social.meeting.status, "cancelled");
});
test("activation locks mobile mutation, end hides peer, withdraw keeps owner and ACK history", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await assert.rejects(
    f.send("PROFILE_CONFIRM", {
      alias: "수정",
      avatarId: "a-01",
      confirmedSummary: emptySummary(),
    }),
  );
  await f.act("CONNECT_END", "car");
  const s = await f.read("car");
  assert.equal(s.social.peer, null);
  assert.ok(s.activeJourney);
  assert.equal(s.handoff.acknowledged, true);
  await f.act("PROFILE_PRIVATE", "car");
  assert.equal((await f.read()).publication, "private");
  await assert.rejects(f.send("HANDOFF_PREPARE", { mode: "connected" }));
});
test("public interest omitted means neutral recommendation; private raw and schedule never leak", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  await f.publish();
  const s = await f.read();
  assert.equal(s.social.candidates[0].reason.includes("공개한 관심사"), false);
  const op = await f.read("operator");
  assert.deepEqual(op.onboarding, {});
  assert.equal(op.profile, null);
  assert.equal(op.trip, null);
  assert.equal((await f.read("web", randomUUID())).social, null);
});
test("one attempt per run survives rejection/cancel; cancel unknown command tombstones late arrival", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  await f.publish();
  const b = (await f.read()).actionBindings.CONNECT_REQUEST,
    c = await f.envelope(b.commandType, b.payload);
  await f.send("CANCEL_PENDING_COMMAND", {
    originalCommandId: c.commandId,
    originalType: c.type,
  });
  await assert.rejects(f.post(c), { code: "CANCELLED" });
  assert.equal((await f.read()).social.connection.attempted, true);
  await assert.rejects(f.send("CONNECT_REQUEST", b.payload));
});
test("restriction and stale heartbeat block meeting/B acceptance but preserve cancellation and reports", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.act("MEETING_PROPOSE", "car");
  await f.send("SET_TEST_RESTRICTION", { enabled: true }, "operator");
  await assert.rejects(f.respond("meeting", "accept"), { code: "RESTRICTED" });
  await f.act("MEETING_CANCEL", "car");
  assert.equal((await f.read("car")).social.meeting.status, "cancelled");
});
test("stale connected snapshot cannot ACK after live connection end, and my_trip never exposes peer", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.send("HANDOFF_PREPARE", { mode: "connected" });
  const old = (await f.read()).handoff;
  await f.act("CONNECT_END");
  assert.equal((await f.read()).handoff, null);
  await f.activate("my_trip");
  const car = await f.read("car");
  assert.equal(car.social.peer, null);
  assert.equal(car.journeyMode, "my_trip");
  assert.equal(car.actionBindings.MEETING_PROPOSE, undefined);
});
test("same device restores active meeting and ACK after restart without another user consent", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const old = (await f.read("car")).social.meeting;
  await f.restart();
  const s = await f.read("car");
  assert.equal(s.social.meeting.proposalId, old.proposalId);
  assert.equal(s.social.meeting.status, "confirmed");
  assert.ok(s.handoff.acknowledged);
  assert.ok(s.activeJourney);
});

test("public approval records exactly selected fields and never infers an unconfirmed style", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  await f.send("PROFILE_PUBLISH", {
    profileVersion: 1,
    approvedFields: ["alias", "avatarId", "speakingStyle"],
  });
  const s = await f.read();
  assert.deepEqual(s.publicApproval.approvedFields, [
    "alias",
    "avatarId",
    "speakingStyle",
  ]);
  assert.equal(s.publicApproval.introTemplateId, "INTRO_NEUTRAL");
});

test("cancelling a received navigation approval preserves meeting consent and allows fresh approval", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const approval = await f.navApprove();
  const attempt = approval.state.navigation.attempts[0];
  const before = approval.state.social.meeting;
  await f.send(
    "CANCEL_PENDING_COMMAND",
    {
      originalCommandId: attempt.approvalCommandId,
      originalType: "NAV_APPROVE",
    },
    "car",
  );
  const s = await f.read("car");
  assert.deepEqual(s.social.meeting, before);
  assert.equal(s.navigation.attempts[0].outcome, "not_dispatched");
  assert.equal(s.navigation.owned, null);
  await assert.rejects(f.dispatch(attempt), { code: "NAV_NOT_READY" });
  const next = await f.navApprove();
  assert.equal(next.state.navigation.attempts.at(-1).outcome, "pending");
  assert.notEqual(
    next.state.navigation.attempts.at(-1).attemptId,
    attempt.attemptId,
  );
});

test("cancelling an undelivered navigation approval blocks its late arrival without cancelling meeting", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const e = f.evidence();
  await f.send(
    "NAV_OBSERVE",
    { ...(await f.common()), source: "real", evidence: e },
    "car",
  );
  const before = (await f.read("car")).social.meeting;
  const c = await f.envelope(
    "NAV_APPROVE",
    {
      ...(await f.common()),
      operation: "add",
      reviewed: e,
      ownedAttemptId: null,
    },
    "car",
    { proposalId: before.proposalId },
  );
  await f.send(
    "CANCEL_PENDING_COMMAND",
    {
      originalCommandId: c.commandId,
      originalType: c.type,
    },
    "car",
  );
  await assert.rejects(f.post(c), { code: "CANCELLED" });
  const s = await f.read("car");
  assert.deepEqual(s.social.meeting, before);
  assert.equal(s.navigation.attempts.length, 0);
});

test("approval cancellation after dispatch preserves physical facts and meeting consent", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const r = await f.navApprove();
  const dispatched = await f.dispatch(r.state.navigation.attempts[0]);
  const a = dispatched.state.navigation.attempts[0];
  const before = dispatched.state.social.meeting;
  await f.send(
    "CANCEL_PENDING_COMMAND",
    {
      originalCommandId: a.approvalCommandId,
      originalType: "NAV_APPROVE",
    },
    "car",
  );
  assert.equal((await f.read("car")).navigation.attempts[0].outcome, "pending");
  await f.report(a, "applied", f.evidence([f.m], a.dispatchAt));
  const s = await f.read("car");
  assert.deepEqual(s.social.meeting, before);
  assert.equal(s.navigation.owned.attemptId, a.attemptId);
  assert.equal(s.navigation.attempts[0].outcome, "applied");
  assert.equal(s.social.cleanupRequired, false);
});

for (const confirmed of [false, true])
  test(`undelivered unrelated proposal cancellation preserves ${confirmed ? "confirmed" : "proposed"} meeting`, async (t) => {
    const f = await fixture(t);
    await f.connect();
    await f.activate();
    await f.act("MEETING_PROPOSE", "car");
    if (confirmed) await f.respond("meeting", "accept");
    const before = (await f.read("car")).social.meeting;
    const unrelated = randomUUID();
    await f.send(
      "CANCEL_PENDING_COMMAND",
      {
        originalCommandId: unrelated,
        originalType: "MEETING_PROPOSE",
      },
      "car",
    );
    assert.deepEqual((await f.read("car")).social.meeting, before);
    await f.restart();
    assert.deepEqual((await f.read("car")).social.meeting, before);
    const c = await f.envelope(
      "MEETING_PROPOSE",
      { placeId: "fiction-cafe-01" },
      "car",
      { connectionId: before.connectionId },
    );
    c.commandId = unrelated;
    await assert.rejects(f.post(c), { code: "CANCELLED" });
  });

test("undelivered first meeting proposal keeps a tombstone across restart and rejects late arrival", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  const b = (await f.read("car")).actionBindings.MEETING_PROPOSE;
  const c = await f.envelope(b.commandType, b.payload, "car", b.target);
  await f.send(
    "CANCEL_PENDING_COMMAND",
    { originalCommandId: c.commandId, originalType: c.type },
    "car",
  );
  await f.restart();
  await assert.rejects(f.post(c), { code: "CANCELLED" });
  const s = await f.read("car");
  assert.equal(s.social.meeting.status, "cancelled");
  assert.equal(s.social.meeting.proposalId, null);
  assert.equal(s.actionBindings.MEETING_PROPOSE, undefined);
});

test("received proposal cancellation revokes only that proposal and late B response cannot revive it", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  const b = (await f.read("car")).actionBindings.MEETING_PROPOSE;
  const c = await f.envelope(b.commandType, b.payload, "car", b.target);
  await f.post(c);
  const responseTarget = (
    await f.read("operator")
  ).social.pendingResponses.find((r) => r.kind === "meeting");
  await f.send(
    "CANCEL_PENDING_COMMAND",
    { originalCommandId: c.commandId, originalType: c.type },
    "car",
  );
  await assert.rejects(
    f.send("B_RESPONSE", { decision: "accept" }, "operator", responseTarget),
  );
  assert.equal((await f.read("car")).social.meeting.status, "cancelled");
});

test("unknown connection cancellation cannot end a different linked connection", async (t) => {
  const f = await fixture(t);
  await f.connect();
  const before = (await f.read()).social.connection;
  await f.send("CANCEL_PENDING_COMMAND", {
    originalCommandId: randomUUID(),
    originalType: "CONNECT_REQUEST",
  });
  assert.deepEqual((await f.read()).social.connection, before);
});
