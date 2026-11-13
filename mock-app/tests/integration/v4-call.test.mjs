import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "../helpers/v4-fixture.mjs";

async function setup(t) {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  return f;
}
async function pending(f) {
  return (await f.read("operator")).social.pendingResponses.find(
    (x) => x.kind === "call",
  );
}
const reject = (action, code) => assert.rejects(action, (e) => e.code === code);

test("plain call needs both consents; sample is car-only and meeting stays separate", async (t) => {
  const f = await setup(t);
  await f.act("CALL_PROPOSE", "car");
  let s = await f.read("car");
  assert.equal(s.call.status, "requested");
  assert.equal(s.call.canPlay, false);
  assert.deepEqual(s.call.lines, []);
  assert.equal((await f.read("web")).call, null);
  assert.equal((await f.read("operator")).call, null);
  assert.equal(s.actionBindings.MEETING_PROPOSE, undefined);
  await reject(
    f.send("MEETING_PROPOSE", { placeId: "fiction-cafe-01" }, "car", {
      connectionId: s.social.connection.id,
    }),
    "RESTRICTED",
  );
  const target = await pending(f);
  const response = await f.envelope(
    "B_RESPONSE",
    { decision: "accept" },
    "operator",
    target,
  );
  await f.post(response);
  const twice = await f.post(response);
  assert.equal(twice.receipt.replayed, true);
  s = await f.read("car");
  assert.equal(s.call.status, "active");
  assert.equal(s.call.canPlay, true);
  assert.deepEqual(
    s.call.lines.map((x) => x.id),
    ["call_general_a", "call_general_b"],
  );
  assert.equal(s.social.meeting.status, "none");
  assert.equal(s.actionBindings.MESSAGE_SEND_M1, undefined);
  await f.act("CALL_END", "car");
  assert.ok((await f.read("car")).actionBindings.MEETING_PROPOSE);
  await reject(
    f.send("B_RESPONSE", { decision: "accept" }, "operator", target),
    "STALE_STATE",
  );
});
for (const terminal of ["CALL_CANCEL", "reject", "CONNECT_END", "RESET_BEGIN"])
  test(`pending call ${terminal} invalidates late consent`, async (t) => {
    const f = await setup(t);
    await f.act("CALL_PROPOSE", "car");
    const target = await pending(f);
    if (terminal === "reject") await f.respond("call", "reject");
    else await f.act(terminal, terminal === "RESET_BEGIN" ? "operator" : "car");
    const s = await f.read("car");
    assert.notEqual(s.call?.status, "active");
    assert.equal(await pending(f), undefined);
    await assert.rejects(
      f.send("B_RESPONSE", { decision: "accept" }, "operator", target),
    );
    assert.notEqual((await f.read("car")).call?.canPlay, true);
  });
test("inactive vehicle preserves request, blocks acceptance, and still permits stop", async (t) => {
  const f = await setup(t);
  await f.act("CALL_PROPOSE", "car");
  const target = await pending(f);
  f.expire();
  assert.deepEqual(await pending(f), target);
  assert.equal((await f.read("operator")).social.callResponseEnabled, false);
  await reject(
    f.send("B_RESPONSE", { decision: "accept" }, "operator", target),
    "RESTRICTED",
  );
  await f.act("CALL_CANCEL", "car");
  assert.equal(await pending(f), undefined);
  await f.status();
  await f.act("CALL_PROPOSE", "car");
  await f.respond("call", "accept");
  f.expire();
  assert.equal((await f.read("car")).call.canPlay, false);
  await f.act("CALL_END", "car");
  assert.equal((await f.read("car")).call.status, "ended");
});
test("restart keeps same active consent, but projection never manufactures playback", async (t) => {
  const f = await setup(t);
  await f.act("CALL_PROPOSE", "car");
  await f.respond("call", "accept");
  const before = (await f.read("car")).call;
  await f.restart();
  const after = (await f.read("car")).call;
  assert.equal(after.id, before.id);
  assert.equal(after.status, "active");
  assert.equal(after.source, "call_sample");
  assert.equal("playing" in after, false);
  await f.act("CALL_END", "car");
  await f.act("CALL_PROPOSE", "car");
  assert.notEqual((await f.read("car")).call.id, before.id);
});
test("lost proposal can be cancelled before or after receipt, without resurrecting consent", async (t) => {
  const f = await setup(t);
  const b = (await f.read("car")).actionBindings.CALL_PROPOSE;
  const cmd = await f.envelope(b.commandType, b.payload, "car", b.target);
  await f.send(
    "CANCEL_PENDING_COMMAND",
    { originalCommandId: cmd.commandId, originalType: "CALL_PROPOSE" },
    "car",
  );
  await reject(f.post(cmd), "CANCELLED");
  assert.equal(await pending(f), undefined);
  const cmd2 = await f.envelope(b.commandType, b.payload, "car", b.target);
  await f.post(cmd2);
  await f.send(
    "CANCEL_PENDING_COMMAND",
    { originalCommandId: cmd2.commandId, originalType: "CALL_PROPOSE" },
    "car",
  );
  assert.equal((await f.read("car")).call.status, "ended");
});
test("only valid Q1 display history unlocks familiar greeting; private interest is not required", async (t) => {
  const f = await setup(t),
    s = await f.read("car");
  await f.send(
    "CAR_STATUS",
    {
      vehicleSessionId: f.session,
      statusSeq: 99,
      restrictionKnown: true,
      restricted: false,
      foreground: true,
      uiContext: "home",
      displayedCue: {
        cueId: "S06_Q1_ANSWER",
        runId: s.runId,
        connectionId: s.social.connection.id,
        peerPublicProfileVersion: 1,
      },
    },
    "car",
  );
  await f.act("CALL_PROPOSE", "car");
  await f.respond("call", "accept");
  assert.equal((await f.read("car")).call.lines[0].id, "call_familiar_a");
});
test("role, target, duplicate proposal and my_trip cannot create unauthorized calls", async (t) => {
  const f = await setup(t),
    b = (await f.read("car")).actionBindings.CALL_PROPOSE;
  await assert.rejects(f.send(b.commandType, b.payload, "web", b.target));
  await reject(
    f.send(b.commandType, b.payload, "car", { connectionId: randomUUID() }),
    "STALE_STATE",
  );
  await f.act("CALL_PROPOSE", "car");
  await reject(f.send(b.commandType, b.payload, "car", b.target), "RESTRICTED");
  await f.act("CALL_CANCEL", "car");
  await f.act("CONNECT_END", "car");
  assert.equal((await f.read("car")).actionBindings.CALL_PROPOSE, undefined);
});
