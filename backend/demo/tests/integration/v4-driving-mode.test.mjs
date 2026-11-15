import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fixture } from "../helpers/v4-fixture.mjs";
import { validateStore } from "../../server/v4/state.mjs";
import { project } from "../../server/v4/projection.mjs";
import { assertContract } from "../../server/v4/validation.mjs";
import { DRIVING_ALLOWED_MASKS } from "../../shared/config/driving-v4.mjs";

const moving = { requiresDo: true, activeRestrictions: 80 };
const parked = { requiresDo: false, activeRestrictions: 0 };
test("shared driving profiles are valid and every configured mask is used by the server", async t => {
  const raw = JSON.parse(await readFile(new URL("../../shared/config/driving-policy.json", import.meta.url)));
  assert.equal(raw.schemaVersion, 1);
  assert.deepEqual(raw.allowedMasks, [0, 80]);
  assert.deepEqual(DRIVING_ALLOWED_MASKS, raw.allowedMasks);
  const f = await setup(t);
  for (const [i, mask] of DRIVING_ALLOWED_MASKS.entries()) {
    await status(f, 2 + i, { requiresDo: true, activeRestrictions: mask });
    assert.equal((await f.read("car")).vehicle.interactionMode, "driving_limited");
  }
});
async function setup(t) {
  const f = await fixture(t);
  await f.connect(); await f.activate("connected", "mock");
  return f;
}
const status = (f, seq, ux, extra = {}) => f.send("CAR_STATUS", {
  vehicleSessionId: f.session, statusSeq: seq, restrictionKnown: true,
  restricted: ux ? ux.requiresDo || ux.activeRestrictions !== 0 : true,
  foreground: true, uiContext: "home", uxRestrictions: ux, ...extra,
}, "car");

test("driving projection permits only prepared local output, not new social or navigation actions", async t => {
  const f = await setup(t);
  const old = await f.envelope("CALL_PROPOSE", { requestedMode: "plain" }, "car", { connectionId: (await f.read("car")).social.connection.id });
  await status(f, 2, moving);
  const s = await f.read("car");
  assert.equal(s.vehicle.interactionMode, "driving_limited");
  assert.equal(s.vehicle.preparedAudioAllowed, true);
  assert.equal(s.vehicle.freshForMs, 2000);
  for (const action of ["CALL_PROPOSE", "MEETING_PROPOSE", "MESSAGE_SEND_M1", "NAV_APPROVE", "FINAL_CHOOSE_TOGETHER"])
    assert.equal(s.actionBindings[action], undefined, action);
  await assert.rejects(f.post({ ...old, commandId: randomUUID(), expectedVersion: s.version }), e => e.code === "RESTRICTED");
  assert.equal(s.call, null);
});

test("raw restrictions cannot be disguised as parked by restricted=false", async t => {
  const f = await setup(t), before = await f.read("car");
  await assert.rejects(status(f, 2, moving, { restricted: false }), e => e.code === "INVALID_TRANSITION");
  const after = await f.read("car");
  assert.equal(after.version, before.version);
  assert.equal(after.vehicle.interactionMode, "parked");
});

test("legacy restricted, unknown, unverified profiles and stale status fail closed", async t => {
  const f = await setup(t);
  await status(f, 2, null);
  assert.equal((await f.read("car")).vehicle.interactionMode, "blocked");
  await status(f, 3, { requiresDo: true, activeRestrictions: 511 });
  assert.equal((await f.read("car")).vehicle.preparedAudioAllowed, false);
  await status(f, 4, moving);
  f.expire();
  const s = await f.read("car");
  assert.equal(s.vehicle.interactionMode, "blocked");
  assert.equal(s.vehicle.preparedAudioAllowed, false);
  assert.equal(s.vehicle.freshForMs, 0);
  await status(f, 5, null, { restrictionKnown: false });
  assert.equal((await f.read("car")).vehicle.interactionMode, "blocked");
});

test("same restricted boolean with a different raw profile advances the business version", async t => {
  const f = await setup(t);
  await status(f, 2, moving);
  const a = await f.read("car");
  await status(f, 3, moving);
  assert.equal((await f.read("car")).version, a.version);
  await status(f, 4, { requiresDo: true, activeRestrictions: 511 });
  const b = await f.read("car");
  assert.equal(b.version, a.version + 1);
  assert.equal(b.vehicle.interactionMode, "blocked");
});

test("return to parked restores actions without applying old approval or creating a call", async t => {
  const f = await setup(t);
  const old = await f.envelope("CALL_PROPOSE", { requestedMode: "plain" }, "car", { connectionId: (await f.read("car")).social.connection.id });
  await status(f, 2, moving); await status(f, 3, parked);
  const s = await f.read("car");
  assert.equal(s.vehicle.interactionMode, "parked");
  assert.ok(s.actionBindings.CALL_PROPOSE);
  await assert.rejects(f.post(old), e => e.code === "STALE_STATE");
  assert.equal((await f.read("car")).call, null);
  assert.equal((await f.read("car")).mockNavigation.attempts.length, 0);
});

test("reset blocks driving output and stored contradictory restriction observations are rejected", async t => {
  const f = await setup(t);
  await status(f, 2, moving);
  const disk = JSON.parse(await readFile(f.file));
  disk.vehicle.restricted = false;
  assert.throws(() => validateStore(disk), /관측 불일치/);
  await f.act("RESET_BEGIN", "operator");
  const s = await f.read("car");
  assert.equal(s.vehicle.interactionMode, "blocked");
  assert.equal(s.vehicle.preparedAudioAllowed, false);
});

test("fractional monotonic server time produces a conservative integer freshness budget", async t => {
  const f = await setup(t);
  await status(f, 2, moving);
  const disk = JSON.parse(await readFile(f.file));
  const state = project(disk, "car", null, disk.vehicle.seenAt + 0.25);
  assertContract("state", state);
  assert.equal(state.vehicle.freshForMs, 1999);
});

test("expired raw observations remain valid on disk without reopening driving playback", async t => {
  const f = await setup(t);
  await status(f, 2, moving);
  f.expire(); await f.read("car");
  const disk = JSON.parse(await readFile(f.file));
  validateStore(disk);
  assert.equal(disk.vehicle.restrictionKnown, false);
  assert.deepEqual(disk.vehicle.uxRestrictions, moving);
  assert.equal(project(disk, "car", null, 12100).vehicle.preparedAudioAllowed, false);
});
