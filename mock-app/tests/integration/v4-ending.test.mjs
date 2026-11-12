import { coordinator } from "../../server/v4/commands.mjs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "../helpers/v4-fixture.mjs";
import { validateStore } from "../../server/v4/state.mjs";
async function ready(t) {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const r = await f.navApprove(),
    d = await f.dispatch(r.state.navigation.attempts.at(-1)),
    a = d.state.navigation.attempts.at(-1),
    e = f.evidence([f.m], a.dispatchAt);
  await f.report(a, "applied", e);
  await f.send(
    "NAV_OBSERVE",
    { ...(await f.common()), source: "real", evidence: e },
    "car",
  );
  return f;
}
async function end(f) {
  await f.act("MEETING_START", "operator");
  return f.act("MEETING_END", "operator");
}
async function choose(f, actor, choice) {
  const key = actor === "car" ? "FINAL_CHOOSE_" : "B_FINAL_";
  return f.act(key + choice.toUpperCase(), actor);
}
async function disk(f) {
  return JSON.parse(await readFile(f.file));
}
function privateProjection(s) {
  const j = JSON.stringify(s);
  for (const field of [
    "aChoice",
    "bChoice",
    "issuedRequestId",
    "finalHistory",
    "finalCheckpoint",
  ])
    assert.equal(j.includes('"' + field + '"'), false);
}
for (const a of ["together", "my_agent"])
  for (const b of ["together", "my_agent"])
    for (const order of ["A", "B"])
      test(`${order} first: ${a}/${b} waits for both, protects choices and resolves once`, async (t) => {
        const f = await ready(t);
        await end(f);
        const first = order === "A" ? "car" : "operator",
          second = order === "A" ? "operator" : "car";
        await choose(f, first, order === "A" ? a : b);
        for (const actor of ["car", "operator", "web"]) {
          const s = await f.read(actor);
          assert.equal(s.journey.final.status, "pending");
          assert.equal(
            s.journey.final.myChoice,
            actor === first ? (first === "car" ? a : b) : null,
          );
          privateProjection(s);
        }
        assert.ok(
          (await f.read(second)).actionBindings[
            (second === "car" ? "FINAL_CHOOSE_" : "B_FINAL_") + "TOGETHER"
          ],
        );
        const x = await choose(f, second, order === "A" ? b : a),
          expected =
            a === "together" && b === "together" ? "together" : "my_agent";
        assert.equal(x.state.journey.final.status, expected);
        assert.equal(x.state.journey.final.requestId, null);
        assert.equal(
          (await f.read("car")).social.connection.status,
          expected === "my_agent" ? "ended" : "linked",
        );
        for (const actor of ["car", "operator", "web"])
          privateProjection(await f.read(actor));
      });
test("start requires current approved applied navigation; end cannot skip reenactment or mint a second round", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const p = (await f.read("car")).social.meeting.proposalId;
  await assert.rejects(
    f.send("MEETING_START", {}, "operator", { proposalId: p }),
    (e) => e.code === "NOT_READY",
  );
  await assert.rejects(
    f.send("MEETING_END", {}, "operator", { proposalId: p }),
    (e) => e.code === "INVALID_TRANSITION",
  );
  const r = await f.navApprove();
  await assert.rejects(
    f.send("MEETING_START", {}, "operator", { proposalId: p }),
    (e) => e.code === "RESTRICTED",
  );
  await f.send(
    "NAV_CANCEL",
    {
      ...(await f.common()),
      attemptId: r.state.navigation.attempts.at(-1).attemptId,
    },
    "car",
  );
});
test("duplicate end/choice receipts do not reopen or resubmit; fresh commands cannot change a submitted choice", async (t) => {
  const f = await ready(t);
  await f.act("MEETING_START", "operator");
  let s = await f.read("operator"),
    b = s.actionBindings.MEETING_END,
    c = await f.envelope(b.commandType, b.payload, "operator", b.target);
  const first = await f.post(c);
  await f.post(c);
  assert.equal(
    (await f.read("car")).journey.final.id,
    first.state.journey.final.id,
  );
  await assert.rejects(
    f.send(b.commandType, b.payload, "operator", b.target),
    (e) => e.code === "INVALID_TRANSITION",
  );
  s = await f.read("car");
  b = s.actionBindings.FINAL_CHOOSE_TOGETHER;
  c = await f.envelope(b.commandType, b.payload, "car", b.target);
  await f.post(c);
  await f.post(c);
  await assert.rejects(
    f.send("FINAL_CHOOSE", { choice: "my_agent" }, "car", b.target),
    (e) => e.code === "INVALID_TRANSITION",
  );
  assert.equal((await f.read("operator")).journey.final.myChoice, null);
});
test("nearly simultaneous independent slots survive optimistic conflict and explicit resubmission", async (t) => {
  const f = await ready(t);
  await end(f);
  const a = (await f.read("car")).actionBindings.FINAL_CHOOSE_MY_AGENT,
    b = (await f.read("operator")).actionBindings.B_FINAL_TOGETHER;
  const ca = await f.envelope(a.commandType, a.payload, "car", a.target),
    cb = await f.envelope(b.commandType, b.payload, "operator", b.target);
  const results = await Promise.allSettled([f.post(ca), f.post(cb)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.code,
    "STALE_STATE",
  );
  const next = await f.read("operator");
  if (next.journey.final.myChoice === null)
    await choose(f, "operator", "together");
  else await choose(f, "car", "my_agent");
  assert.equal((await f.read("car")).journey.final.status, "my_agent");
});
test("replay preserves current live state and actual navigation, creates new private slots, rejects all old targets", async (t) => {
  const f = await ready(t);
  await end(f);
  const old = (await f.read("operator")).actionBindings.B_FINAL_TOGETHER;
  await choose(f, "car", "my_agent");
  await choose(f, "operator", "together");
  await f.act("PROFILE_PRIVATE", "car");
  const before = await disk(f);
  await f.act("REPLAY_FINAL", "operator");
  const after = await disk(f);
  for (const k of [
    "profile",
    "publicApproval",
    "publication",
    "social",
    "navigation",
    "vehicle",
    "vehicleActivation",
    "trip",
  ])
    assert.deepEqual(after[k], before[k], k);
  assert.equal(after.replayContext.mode, "final_replay");
  assert.notEqual(after.final.id, before.final.id);
  assert.equal(after.final.round, 2);
  assert.notEqual(after.final.requestId, before.final.issuedRequestId);
  assert.equal(after.final.aChoice, null);
  assert.equal(after.final.bChoice, null);
  assert.equal(after.finalHistory[0].status, "my_agent");
  await assert.rejects(
    f.send(old.commandType, old.payload, "operator", old.target),
    (e) => e.code === "STALE_STATE",
  );
  for (const type of ["MESSAGE_SEND", "MEETING_PROPOSE", "HANDOFF_PREPARE"]) {
    const payload =
        type === "MESSAGE_SEND"
          ? { messagePresetId: "M1" }
          : type === "MEETING_PROPOSE"
            ? { placeId: "fiction-cafe-01" }
            : { mode: "my_trip" },
      actor = type === "HANDOFF_PREPARE" ? "web" : "car",
      target =
        actor === "car" ? { connectionId: after.social.connection.id } : {};
    await assert.rejects(
      f.send(type, payload, actor, target),
      (e) => e.code === "REPLAY_ONLY",
    );
  }
  await choose(f, "operator", "together");
  await choose(f, "car", "together");
  assert.equal((await f.read("car")).journey.phase, "together");
  assert.equal((await f.read("car")).social.connection.status, "ended");
  assert.equal((await disk(f)).publication, "private");
});
test("normal connection end cancels a pending choice, never substitutes a missing selection", async (t) => {
  const f = await ready(t);
  await end(f);
  await choose(f, "car", "my_agent");
  await f.act("CONNECT_END", "car");
  const s = await f.read("car");
  assert.equal(s.journey.final.status, "cancelled");
  assert.equal(s.journey.final.requestId, null);
  assert.equal((await disk(f)).final.bChoice, null);
  assert.equal(s.actionBindings.REPLAY_FINAL, undefined);
  assert.ok((await disk(f)).finalCheckpoint);
});
test("restriction, stale vehicle and unknown SDK facts block time changes, submissions and replay", async (t) => {
  const f = await ready(t);
  await end(f);
  const b = (await f.read("car")).actionBindings.FINAL_CHOOSE_TOGETHER;
  await f.send("SET_TEST_RESTRICTION", { enabled: true }, "operator");
  await assert.rejects(
    f.send(b.commandType, b.payload, "car", b.target),
    (e) => e.code === "RESTRICTED",
  );
  await f.send("SET_TEST_RESTRICTION", { enabled: false }, "operator");
  f.expire();
  await assert.rejects(
    f.send(b.commandType, b.payload, "car", b.target),
    (e) => e.code === "RESTRICTED",
  );
  await f.status();
  await choose(f, "car", "together");
  await choose(f, "operator", "together");
  await f.send("SET_TEST_RESTRICTION", { enabled: true }, "operator");
  assert.equal(
    (await f.read("operator")).actionBindings.REPLAY_FINAL,
    undefined,
  );
});
test("restart restores pending independent choices and role-specific receipt queries never reveal the peer choice", async (t) => {
  const f = await ready(t);
  await end(f);
  const b = (await f.read("operator")).actionBindings.B_FINAL_MY_AGENT,
    c = await f.envelope(b.commandType, b.payload, "operator", b.target);
  await f.post(c);
  await f.restart();
  const s = await f.read("car");
  assert.equal(s.journey.final.myChoice, null);
  assert.equal(s.journey.final.status, "pending");
  privateProjection(await f.receipt("car", c.runId, c.commandId));
  const receipt = await f.receipt("operator", c.runId, c.commandId);
  privateProjection(receipt);
  assert.equal(receipt.state.journey.final.myChoice, "my_agent");
  await choose(f, "car", "together");
  assert.equal((await f.read("car")).journey.phase, "my_agent");
});
test("stored final invariants reject fabricated results or checkpoints", async (t) => {
  const f = await ready(t);
  await end(f);
  const s = await disk(f);
  s.final.status = "together";
  s.final.requestId = null;
  assert.throws(() => validateStore(s));
});

async function publishedReady(t, publicInterests = true) {
  const f = await fixture(t);
  await f.prepare();
  let s = await f.read();
  await f.send("PROFILE_CONFIRM", {
    alias: "파도",
    avatarId: "a-01",
    confirmedSummary: {
      ...s.profile.privateSummary,
      interests: ["sea_walk", "cafe"],
    },
  });
  s = await f.read();
  await f.send("PROFILE_PUBLISH", {
    profileVersion: s.profileVersion,
    approvedFields: [
      "alias",
      "avatarId",
      ...(publicInterests ? ["interests"] : []),
    ],
  });
  await f.act("TRIP_SHARE_CONFIRM");
  await f.act("CONNECT_REQUEST");
  await f.respond("connection", "accept");
  await f.act("CONFIRM_WINDOW");
  await f.activate();
  await f.meeting();
  const r = await f.navApprove(),
    d = await f.dispatch(r.state.navigation.attempts.at(-1)),
    a = d.state.navigation.attempts.at(-1),
    e = f.evidence([f.m], a.dispatchAt);
  await f.report(a, "applied", e);
  await f.send(
    "NAV_OBSERVE",
    { ...(await f.common()), source: "real", evidence: e },
    "car",
  );
  return f;
}
for (const variant of [
  "familiar",
  "no-cue",
  "no-peer-intro",
  "private-interests",
  "wrong-run",
])
  test(`meeting script uses explicit cue/public/story evidence: ${variant}`, async (t) => {
    const f = await publishedReady(t, variant !== "private-interests");
    const s = await f.read("car");
    if (variant === "no-peer-intro")
      await f.send("SET_STORY_CONTEXT", { peerIntroSeen: false }, "operator", {
        proposalId: s.social.meeting.proposalId,
      });
    if (variant !== "no-cue") {
      const v = (await disk(f)).vehicle;
      await f.send(
        "CAR_STATUS",
        {
          vehicleSessionId: v.vehicleSessionId,
          statusSeq: v.statusSeq + 1,
          restrictionKnown: true,
          restricted: false,
          foreground: true,
          uiContext: "home",
          displayedCue: {
            cueId: "S06_Q1_ANSWER",
            runId:
              variant === "wrong-run"
                ? "00000000-0000-4000-8000-000000000001"
                : s.runId,
            connectionId: s.social.connection.id,
            peerPublicProfileVersion: 1,
          },
        },
        "car",
      );
    }
    await f.act("MEETING_START", "operator");
    assert.equal(
      (await f.read("car")).journey.meetingVariant,
      variant === "familiar" ? "familiar" : "general",
    );
    assert.equal("displayedCue" in (await disk(f)).vehicle, false);
  });
test("unknown SDK attempt cannot be promoted to a meeting or checkpoint", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const r = await f.navApprove(),
    d = await f.dispatch(r.state.navigation.attempts.at(-1)),
    a = d.state.navigation.attempts.at(-1);
  await f.report(a, "unknown", null);
  const s = await f.read("car");
  await assert.rejects(
    f.send("MEETING_START", {}, "operator", {
      proposalId: s.social.meeting.proposalId,
    }),
    (e) => e.code === "RESTRICTED",
  );
  assert.equal((await disk(f)).finalCheckpoint, null);
});
test("old SDK grants and new add approvals remain closed during final replay", async (t) => {
  const f = await ready(t);
  await end(f);
  await choose(f, "car", "together");
  await choose(f, "operator", "together");
  await f.act("REPLAY_FINAL", "operator");
  const s = await f.read("car");
  await assert.rejects(
    f.send(
      "NAV_APPROVE",
      {
        ...(await f.common()),
        operation: "add",
        reviewed: f.evidence(),
        ownedAttemptId: null,
      },
      "car",
      { proposalId: s.social.meeting.proposalId },
    ),
    (e) => e.code === "REPLAY_ONLY",
  );
  const a = s.navigation.attempts[0];
  await assert.rejects(f.dispatch(a), (e) => e.code === "REPLAY_ONLY");
});
test("reset after completed meeting removes the owned waypoint before clearing choices/checkpoint", async (t) => {
  const f = await ready(t);
  await end(f);
  await choose(f, "operator", "my_agent");
  await choose(f, "car", "together");
  const s = await f.read("car");
  await f.send("RESET_BEGIN", {}, "operator", { runId: s.runId });
  let current = await f.read("car");
  assert.equal(current.actionBindings.RESET_ACK, undefined);
  assert.equal(current.journey.final.status, "my_agent");
  let e = f.evidence([f.m], 7000);
  await f.send(
    "NAV_OBSERVE",
    { ...(await f.common()), source: "real", evidence: e },
    "car",
  );
  let r = await f.send(
    "NAV_REMOVE_APPROVE",
    {
      ...(await f.common()),
      operation: "remove",
      reviewed: e,
      ownedAttemptId: s.navigation.owned.attemptId,
    },
    "car",
    { reason: "reset_cleanup", resetId: current.reset.id },
  );
  let d = await f.dispatch(r.state.navigation.attempts.at(-1)),
    a = d.state.navigation.attempts.at(-1);
  e = f.evidence([], a.dispatchAt);
  await f.report(a, "removed", e);
  await f.send(
    "NAV_OBSERVE",
    { ...(await f.common()), source: "real", evidence: e },
    "car",
  );
  current = await f.read("car");
  const b = current.actionBindings.RESET_ACK;
  b.payload.journal = {
    scope: `${s.storeId}:${s.runId}:${f.device}`,
    attemptId: a.attemptId,
    reportId: current.navigation.attempts.at(-1).reports.at(-1).reportId,
    outcome: "removed",
    acknowledged: true,
    sdkCalls: 1,
  };
  await f.send(b.commandType, b.payload, "car", b.target);
  const out = await disk(f);
  assert.equal(out.final, null);
  assert.equal(out.finalCheckpoint, null);
  assert.deepEqual(out.finalHistory, []);
  assert.equal(out.finalRound, 0);
  assert.equal(out.resetHistory.at(-1).navigation.attempts.length, 2);
});

for (const hiddenActor of ["car", "operator"])
  test(`unsubmitted ${hiddenActor === "car" ? "B" : "A"} receives byte-equivalent state for either peer choice`, async (t) => {
    const f = await ready(t);
    await end(f);
    const seed = await disk(f),
      views = [];
    for (const choice of ["together", "my_agent"]) {
      const api = coordinator(
        join(dirname(f.file), "fork-" + choice + ".json"),
        structuredClone(seed),
        { now: () => 10000 },
      );
      let s = await api.read("car", null);
      let c = {
        schemaVersion: 4,
        runSeq: s.runSeq,
        runId: s.runId,
        expectedVersion: s.version,
        commandId: randomUUID(),
        actor: "car",
        type: "CAR_STATUS",
        target: {},
        payload: {
          vehicleSessionId: seed.vehicle.vehicleSessionId,
          statusSeq: seed.vehicle.statusSeq + 1,
          restrictionKnown: true,
          restricted: false,
          foreground: true,
          uiContext: "home",
        },
      };
      await api.command(c, "car", null);
      const actor = hiddenActor === "car" ? "operator" : "car";
      s = await api.read(actor, null);
      const b =
        s.actionBindings[
          (actor === "car" ? "FINAL_CHOOSE_" : "B_FINAL_") +
            choice.toUpperCase()
        ];
      c = {
        ...c,
        expectedVersion: s.version,
        commandId: randomUUID(),
        actor,
        type: b.commandType,
        target: b.target,
        payload: b.payload,
      };
      await api.command(c, actor, null);
      views.push(await api.read(hiddenActor, null));
    }
    assert.deepEqual(views[0], views[1]);
  });
test("blocked-request visibility never revives a message after meeting starts or final replay opens", async (t) => {
  const f = await ready(t);
  await f.act("MESSAGE_SEND_M1", "car");
  const target = (await f.read("operator")).social.pendingResponses.find(
    (x) => x.kind === "message",
  );
  assert.ok(target);
  await f.act("MEETING_START", "operator");
  for (const step of ["meeting", "pending", "together", "replay"]) {
    if (step === "pending") await f.act("MEETING_END", "operator");
    if (step === "together") {
      await choose(f, "car", "together");
      await choose(f, "operator", "together");
    }
    if (step === "replay") await f.act("REPLAY_FINAL", "operator");
    const s = await f.read("operator");
    assert.deepEqual(s.social.pendingResponses, []);
    assert.equal(s.social.messageResponseEnabled, false);
    await assert.rejects(
      f.send("B_RESPONSE", { decision: "reply" }, "operator", target),
    );
    assert.equal((await disk(f)).content.threads[0].status, "closed");
  }
});

test("historical choices and checkpoint cannot be corrupted to fabricate replay outcomes", async (t) => {
  const f = await ready(t);
  await end(f);
  await choose(f, "car", "together");
  await choose(f, "operator", "my_agent");
  await f.act("REPLAY_FINAL", "operator");
  const seed = await disk(f);
  let bad = structuredClone(seed);
  bad.finalHistory[0].bChoice = "together";
  assert.throws(() => validateStore(bad));
  bad = structuredClone(seed);
  bad.finalCheckpoint.storyConnectionId =
    "00000000-0000-4000-8000-000000000001";
  assert.throws(() => validateStore(bad));
});

test("ending-only replay keeps independent choice open after live connection end and publication withdrawal", async (t) => {
  const f = await ready(t);
  await end(f);
  await choose(f, "car", "together");
  await choose(f, "operator", "together");
  await f.act("REPLAY_FINAL", "operator");
  await f.act("CONNECT_END", "car");
  await f.act("PROFILE_PRIVATE", "car");
  assert.equal((await f.read("car")).journey.final.status, "pending");
  await choose(f, "operator", "my_agent");
  await choose(f, "car", "together");
  assert.equal((await f.read("car")).journey.phase, "my_agent");
  assert.equal((await disk(f)).publication, "private");
});
test("several replays preserve one completed meeting and current navigation without regenerating it", async (t) => {
  const f = await ready(t);
  await end(f);
  const seed = await disk(f);
  for (let i = 0; i < 4; i++) {
    await choose(f, "operator", i % 2 ? "my_agent" : "together");
    await choose(f, "car", "together");
    if (i < 3) await f.act("REPLAY_FINAL", "operator");
  }
  const s = await disk(f);
  assert.equal(s.finalRound, 4);
  assert.equal(s.finalHistory.length, 3);
  assert.deepEqual(s.finalCheckpoint, seed.finalCheckpoint);
  assert.deepEqual(s.navigation, seed.navigation);
  assert.equal(s.social.meeting.status, "ended");
});
