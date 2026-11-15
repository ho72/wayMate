import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { vehicleFixture } from "./helpers/vehicle-fixture.mjs";
const audio = Buffer.from("ID3-service-test");
const provider = (synthesize = async () => audio) => ({ voices: ["default", "dragon", "bear"], synthesize });
const body = () => ({ requestId: randomUUID(), text: "반가워요. 여행을 시작해요.", voice: "dragon", consent: true });
async function speechRequest(f, path, payload, headers = {}) {
  return fetch(f.base() + path, {
    method: payload === undefined ? "GET" : "POST",
    headers: { ...(payload === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}
const mobileHeaders = (f, u) => ({ Origin: f.base(), Cookie: u.cookie, "X-CSRF-Token": u.csrf });
const deviceHeaders = (d) => ({ "X-Waymate-Device-Id": d.id, Authorization: "Bearer " + d.token });

test("mobile TTS requires session, same origin, CSRF and separate consent; returns private MP3", async (t) => {
  let calls = 0;
  const f = await vehicleFixture(t, { speechProvider: provider(async () => { calls++; return audio; }) });
  const u = await f.register();
  const payload = body();
  assert.equal((await speechRequest(f, "/api/tts", payload, { Origin: f.base() })).status, 401);
  assert.equal((await speechRequest(f, "/api/tts", payload, { ...mobileHeaders(f, u), Origin: "https://other.test" })).status, 403);
  assert.equal((await speechRequest(f, "/api/tts", payload, { ...mobileHeaders(f, u), "X-CSRF-Token": "wrong" })).status, 403);
  assert.equal((await speechRequest(f, "/api/tts", { ...payload, consent: false }, mobileHeaders(f, u))).status, 403);
  const config = await speechRequest(f, "/api/tts/config", undefined, mobileHeaders(f, u));
  assert.equal((await config.json()).available, true);
  const r = await speechRequest(f, "/api/tts", payload, mobileHeaders(f, u));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), audio);
  const replay = await speechRequest(f, "/api/tts", payload, mobileHeaders(f, u));
  assert.equal(replay.headers.get("X-TTS-Replayed"), "true");
  assert.equal(calls, 1);
});

test("native Pleos TTS uses device credentials and active pairing; browser cookies are rejected", async (t) => {
  let calls = 0;
  const f = await vehicleFixture(t, { speechProvider: provider(async () => { calls++; return audio; }) });
  const u = await f.register(), d = f.newDevice();
  await f.enroll(d);
  assert.equal((await speechRequest(f, "/api/vehicle/tts", body(), deviceHeaders(d))).status, 403);
  assert.equal((await speechRequest(f, "/api/vehicle/tts", body())).status, 401);
  const paired = await f.paired(u), headers = deviceHeaders(paired);
  assert.equal((await speechRequest(f, "/api/vehicle/tts/config", undefined, headers)).status, 200);
  assert.equal((await speechRequest(f, "/api/vehicle/tts", body(), { ...headers, Origin: f.base() })).status, 403);
  const r = await speechRequest(f, "/api/vehicle/tts", body(), headers);
  assert.equal(r.status, 200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), audio);
  assert.equal(calls, 1);
  await f.native(paired, "unpair", { pairingId: paired.pairingId });
  assert.equal((await speechRequest(f, "/api/vehicle/tts", body(), headers)).status, 403);
});

test("TTS stays disabled without a provider and invalid bodies cannot invoke it", async (t) => {
  const f = await vehicleFixture(t), u = await f.register(), headers = mobileHeaders(f, u);
  const r = await speechRequest(f, "/api/tts/config", undefined, headers);
  assert.equal((await r.json()).available, false);
  assert.equal((await speechRequest(f, "/api/tts", body(), headers)).status, 503);
  assert.equal((await speechRequest(f, "/api/tts", { ...body(), text: "가".repeat(2001) }, headers)).status, 422);
});

test("logout during generation prevents returning audio to the revoked session", async (t) => {
  let finish, started;
  const ready = new Promise((r) => { started = r; });
  const f = await vehicleFixture(t, { speechProvider: provider(() => { started(); return new Promise((r) => { finish = r; }); }) });
  const u = await f.register();
  const pending = speechRequest(f, "/api/tts", body(), mobileHeaders(f, u));
  await ready;
  await f.request(u, "/api/auth/logout", {});
  finish(audio);
  assert.equal((await pending).status, 401);
});

test("unpair during generation prevents returning audio to the old vehicle pairing", async (t) => {
  let finish, started;
  const ready = new Promise((r) => { started = r; });
  const f = await vehicleFixture(t, { speechProvider: provider(() => { started(); return new Promise((r) => { finish = r; }); }) });
  const u = await f.register(), d = await f.paired(u);
  const pending = speechRequest(f, "/api/vehicle/tts", body(), deviceHeaders(d));
  await ready;
  await f.native(d, "unpair", { pairingId: d.pairingId });
  finish(audio);
  assert.equal((await pending).status, 403);
});
