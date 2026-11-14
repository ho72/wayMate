import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "../helpers/v4-fixture.mjs";
import {
  profileAnswer,
  UNKNOWN,
  PEER_TOPIC_GENERAL,
} from "../../shared/config/content-v4.mjs";
import { peer } from "../../server/v4/social.mjs";
const setup = async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  return f;
};
const send = async (f, id = "M1") => f.act("MESSAGE_SEND_" + id, "car");
const current = async (f) =>
  (await f.read("operator")).social.pendingResponses.find(
    (t) => t.kind === "message",
  );
const reply = async (f) =>
  f.send("B_RESPONSE", { decision: "reply" }, "operator", await current(f));
test("profile answers require public B facts and use a neutral topic when shared A interests are unavailable", () => {
  assert.notEqual(profileAnswer("Q1", peer), UNKNOWN);
  assert.equal(profileAnswer("Q2", peer, []), PEER_TOPIC_GENERAL);
  assert.notEqual(profileAnswer("Q2", peer, ["sea_walk", "cafe"]), UNKNOWN);
  for (const key of [
    "interests",
    "pace",
    "activityPreference",
    "expressionPresetIds",
  ])
    assert.equal(
      profileAnswer("Q1", {
        ...peer,
        approvedFields: peer.approvedFields.filter((x) => x !== key),
      }),
      UNKNOWN,
    );
  assert.equal(
    profileAnswer("Q2", { ...peer, conversationStyle: null }, [
      "sea_walk",
      "cafe",
    ]),
    UNKNOWN,
  );
  assert.equal(profileAnswer("unpublished", peer), UNKNOWN);
});
for (const id of ["M1", "M2"])
  test(`${id}: only explicit send creates B request; matching response and one followup reply`, async (t) => {
    const f = await setup(t);
    const before = await f.read("car");
    assert.equal(before.content.threads.length, 0);
    assert.equal(await current(f), undefined);
    assert.equal(
      before.content.questions.find((q) => q.id === "Q2").known,
      true,
    );
    assert.equal((await f.read("web")).content, null);
    assert.equal((await f.read("operator")).content, null);
    const r = await send(f, id);
    assert.equal(r.state.content.threads[0].status, "waiting");
    assert.equal(r.state.social.meeting.status, "none");
    assert.equal(r.state.content.threads[0].response, null);
    await assert.rejects(
      f.send(
        before.actionBindings.MESSAGE_SEND_M1.commandType,
        before.actionBindings.MESSAGE_SEND_M1.payload,
        "car",
        before.actionBindings.MESSAGE_SEND_M1.target,
      ),
      (e) => e.code === "INVALID_TRANSITION",
    );
    await reply(f);
    const s = await f.read("car"),
      thread = s.content.threads[0];
    assert.equal(thread.responsePresetId, id);
    assert.ok(thread.followup);
    assert.equal(s.social.meeting.status, "none");
    const b = s.actionBindings.MESSAGE_REPLY_R2;
    assert.ok(b);
    await f.send(b.commandType, b.payload, "car", b.target);
    const done = (await f.read("car")).content.threads[0];
    assert.equal(done.status, "replied");
    assert.equal(done.replyPresetId, "R2");
    await assert.rejects(
      f.send(b.commandType, { replyPresetId: "R1" }, "car", b.target),
      (e) => e.code === "INVALID_TRANSITION",
    );
  });
test("duplicate send receipt and restart preserve one message; cannot reply before a real B event", async (t) => {
  const f = await setup(t);
  const s = await f.read("car"),
    b = s.actionBindings.MESSAGE_SEND_M1,
    c = await f.envelope(b.commandType, b.payload, "car", b.target);
  await f.post(c);
  await f.post(c);
  let x = (await f.read("car")).content.threads;
  assert.equal(x.length, 1);
  await assert.rejects(
    f.send("MESSAGE_REPLY", { replyPresetId: "R1" }, "car", {
      threadId: x[0].id,
      followupQuestionId: "F1",
    }),
  );
  await f.restart();
  await f.status();
  x = (await f.read("car")).content.threads;
  assert.equal(x.length, 1);
  assert.equal(x[0].status, "waiting");
  await reply(f);
  assert.equal((await f.read("car")).content.threads[0].status, "received");
});

test("a waiting message stays visible while vehicle is restricted, stale or in background", async (t) => {
  const f = await setup(t);
  await send(f);
  const target = await current(f);
  await f.send("SET_TEST_RESTRICTION", { enabled: true }, "operator");
  assert.deepEqual(await current(f), target);
  assert.equal((await f.read("operator")).social.messageResponseEnabled, false);
  await assert.rejects(reply(f), { code: "RESTRICTED" });
  await f.send("SET_TEST_RESTRICTION", { enabled: false }, "operator");
  f.expire();
  assert.deepEqual(await current(f), target);
  assert.equal((await f.read("operator")).social.messageResponseEnabled, false);
  await assert.rejects(reply(f), { code: "RESTRICTED" });
  await f.send(
    "CAR_STATUS",
    {
      vehicleSessionId: f.session,
      statusSeq: 100,
      restrictionKnown: true,
      restricted: false,
      foreground: false,
      uiContext: "home",
    },
    "car",
  );
  assert.deepEqual(await current(f), target);
  assert.equal((await f.read("operator")).social.messageResponseEnabled, false);
  await assert.rejects(reply(f), { code: "RESTRICTED" });
  await f.send(
    "CAR_STATUS",
    {
      vehicleSessionId: f.session,
      statusSeq: 101,
      restrictionKnown: true,
      restricted: false,
      foreground: true,
      uiContext: "home",
    },
    "car",
  );
  assert.equal((await f.read("operator")).social.messageResponseEnabled, true);
  await reply(f);
  assert.equal(await current(f), undefined);
  assert.equal((await f.read("car")).content.threads[0].status, "received");
});

test("reusing a completed preset needs a fresh explicit command and never reuses its thread or reply", async (t) => {
  const f = await setup(t);
  const first = await send(f);
  await reply(f);
  await f.act("MESSAGE_REPLY_R1", "car");
  const again = await send(f);
  const ts = again.state.content.threads;
  assert.equal(ts.length, 2);
  assert.equal(ts[0].status, "replied");
  assert.equal(ts[1].status, "waiting");
  assert.equal(ts[1].response, null);
  assert.notEqual(ts[0].id, ts[1].id);
  assert.notEqual(ts[0].requestId, ts[1].requestId);
  assert.equal(ts[0].id, first.state.content.threads[0].id);
  assert.equal((await current(f)).threadId, ts[1].id);
});
for (const stop of ["CONNECT_END", "MEETING_CANCEL", "MEETING_DECLINE"])
  test(`${stop} closes waiting message and rejects late B reply`, async (t) => {
    const f = await setup(t);
    if (stop === "MEETING_CANCEL") await f.meeting();
    await send(f);
    const target = await current(f);
    await f.act(stop, "car");
    await assert.rejects(
      f.send("B_RESPONSE", { decision: "reply" }, "operator", target),
    );
    assert.equal((await f.read("car")).content, null);
    assert.equal(await current(f), undefined);
    const store = JSON.parse(await readFile(f.file));
    assert.equal(store.content.threads[0].status, "closed");
  });
test("restriction, stale vehicle, reset and wrong actor block sending/B events without losing a waiting message", async (t) => {
  const f = await setup(t);
  const binding = (await f.read("car")).actionBindings.MESSAGE_SEND_M1;
  await send(f);
  const target = await current(f);
  await f.send("SET_TEST_RESTRICTION", { enabled: true }, "operator");
  await assert.rejects(
    f.send("B_RESPONSE", { decision: "reply" }, "operator", target),
    (e) => e.code === "RESTRICTED",
  );
  await f.send("SET_TEST_RESTRICTION", { enabled: false }, "operator");
  f.expire();
  await assert.rejects(
    f.send("B_RESPONSE", { decision: "reply" }, "operator", target),
    (e) => e.code === "RESTRICTED",
  );
  await f.status();
  await f.send("RESET_BEGIN", {}, "operator", {
    runId: (await f.read("operator")).runId,
  });
  await assert.rejects(
    f.send(binding.commandType, binding.payload, "car", binding.target),
    (e) => e.code === "RESETTING",
  );
  await assert.rejects(
    f.send("B_RESPONSE", { decision: "reply" }, "operator", target),
    (e) => e.code === "RESETTING",
  );
});
test("stale thread or arbitrary/free-text payload cannot reply to another request", async (t) => {
  const f = await setup(t);
  await send(f);
  const target = await current(f);
  await assert.rejects(
    f.send("B_RESPONSE", { decision: "reply" }, "operator", {
      ...target,
      requestId: "00000000-0000-4000-8000-000000000001",
    }),
    (e) => e.code === "STALE_STATE",
  );
  await assert.rejects(
    f.send(
      "B_RESPONSE",
      { decision: "reply", text: "forged" },
      "operator",
      target,
    ),
    (e) => e.code === "INVALID_PAYLOAD",
  );
  await assert.rejects(
    f.send("MESSAGE_SEND", { messagePresetId: "M1" }, "web", {
      connectionId: target.connectionId,
    }),
    (e) => e.code === "INVALID_PAYLOAD",
  );
});
test("cancelling an unconfirmed send stops late delivery; already-sent cancellation is not a recall", async (t) => {
  const f = await setup(t);
  const b = (await f.read("car")).actionBindings.MESSAGE_SEND_M1,
    c = await f.envelope(b.commandType, b.payload, "car", b.target);
  await f.send(
    "CANCEL_PENDING_COMMAND",
    { originalCommandId: c.commandId, originalType: "MESSAGE_SEND" },
    "car",
  );
  await assert.rejects(f.post(c), (e) => e.code === "CANCELLED");
  assert.equal((await f.read("car")).content.threads.length, 0);
  const next = await f.envelope(b.commandType, b.payload, "car", b.target);
  await f.post(next);
  await f.send(
    "CANCEL_PENDING_COMMAND",
    { originalCommandId: next.commandId, originalType: "MESSAGE_SEND" },
    "car",
  );
  assert.equal((await f.read("car")).content.threads[0].status, "waiting");
  await reply(f);
});

test("reset empties messages only after car ACK and old B commands cannot enter the new run", async (t) => {
  const f = await setup(t);
  await send(f);
  const target = await current(f);
  const late = await f.envelope(
    "B_RESPONSE",
    { decision: "reply" },
    "operator",
    target,
  );
  const old = (await f.read("car")).runId;
  await f.send("RESET_BEGIN", {}, "operator", { runId: old });
  assert.equal((await f.read("car")).runId, old);
  await f.act("RESET_ACK", "car");
  assert.notEqual((await f.read("car")).runId, old);
  assert.equal((await f.read("car")).content, null);
  const disk = JSON.parse(await readFile(f.file));
  assert.deepEqual(disk.content.threads, []);
  assert.ok(!JSON.stringify(disk.resetHistory).includes("messagePresetId"));
  await assert.rejects(f.post(late), (e) => e.code === "RUN_CHANGED");
});
test("my_trip has no peer content or message bindings", async (t) => {
  const f = await fixture(t);
  await f.prepare();
  await f.activate("my_trip");
  const s = await f.read("car");
  assert.equal(s.content, null);
  assert.equal(s.actionBindings.MESSAGE_SEND_M1, undefined);
  await assert.rejects(
    f.send("MESSAGE_SEND", { messagePresetId: "M1" }, "car", {
      connectionId: "00000000-0000-4000-8000-000000000001",
    }),
    (e) => e.code === "INVALID_TRANSITION",
  );
});
test("meeting rejection closes pending messages without pretending a reply or consent occurred", async (t) => {
  const f = await setup(t);
  await send(f);
  const target = await current(f);
  await f.act("MEETING_PROPOSE", "car");
  await f.respond("meeting", "reject");
  assert.equal((await f.read("car")).social.meeting.status, "declined");
  await assert.rejects(
    f.send("B_RESPONSE", { decision: "reply" }, "operator", target),
  );
});

test("cancelling an undelivered meeting proposal also closes an existing message wait", async (t) => {
  const f = await setup(t);
  await send(f);
  const target = await current(f);
  const binding = (await f.read("car")).actionBindings.MEETING_PROPOSE;
  const proposal = await f.envelope(
    binding.commandType,
    binding.payload,
    "car",
    binding.target,
  );
  await f.send(
    "CANCEL_PENDING_COMMAND",
    { originalCommandId: proposal.commandId, originalType: "MEETING_PROPOSE" },
    "car",
  );
  assert.equal((await f.read("car")).social.meeting.status, "cancelled");
  assert.equal((await f.read("car")).content, null);
  assert.equal(
    JSON.parse(await readFile(f.file)).content.threads[0].status,
    "closed",
  );
  await assert.rejects(f.post(proposal), (e) => e.code === "CANCELLED");
  await assert.rejects(
    f.send("B_RESPONSE", { decision: "reply" }, "operator", target),
  );
});
