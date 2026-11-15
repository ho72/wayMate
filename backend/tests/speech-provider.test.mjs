import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { elevenLabsFromEnvironment } from "../../shared/server/elevenlabs.mjs";
import { speechService } from "../../shared/server/speech.mjs";
const audio = Buffer.from("ID3-test-mp3");
const env = { ELEVENLABS_API_KEY: "private-test-key", ELEVENLABS_VOICE_ID: "testVoice", ELEVENLABS_VOICE_DRAGON: "dragonVoice" };
const body = (extra = {}) => ({ requestId: randomUUID(), text: "안녕하세요. 함께 여행해요.", consent: true, ...extra });
const fake = (synthesize = async () => audio) => ({ voices: ["default", "dragon", "bear"], synthesize });
const code = (expected) => (e) => e.code === expected;

test("ElevenLabs is optional; incomplete voice configuration fails at startup", () => {
  assert.equal(elevenLabsFromEnvironment({}), null);
  assert.throws(() => elevenLabsFromEnvironment({ ELEVENLABS_API_KEY: "key" }), /VOICE_ID/);
  assert.throws(() => elevenLabsFromEnvironment({ ...env, ELEVENLABS_VOICE_BEAR: "../invalid" }), /voice IDs/);
});

test("server sends its key and mapped voice to fixed ElevenLabs URL; returns MP3 bytes", async () => {
  let calls = 0;
  const provider = elevenLabsFromEnvironment(env, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.elevenlabs.io/v1/text-to-speech/dragonVoice?output_format=mp3_44100_128");
    assert.equal(options.headers["xi-api-key"], env.ELEVENLABS_API_KEY);
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), { text: "한국어 안내", model_id: "eleven_multilingual_v2" });
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg" } });
  });
  const service = speechService(provider);
  assert.deepEqual((await service.synthesize("user-a", body({ text: "한국어 안내", voice: "dragon" }))).audio, audio);
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(service.config()).includes("private-test-key"));
  assert.ok(!JSON.stringify(service.config()).includes("dragonVoice"));
  await service.close();
});

test("provider errors never expose upstream bodies, URLs, text or credentials", async () => {
  for (const status of [401, 422, 429, 500]) {
    const provider = elevenLabsFromEnvironment(env, async () => new Response("secret upstream details", { status }));
    const service = speechService(provider);
    await assert.rejects(service.synthesize("a", body()), (e) => {
      assert.equal(e.status, status === 429 ? 503 : 502);
      assert.doesNotMatch(e.message, /secret|private-test-key/);
      return true;
    });
    await service.close();
  }
});

test("non-audio, empty and oversized upstream responses are rejected", async () => {
  for (const response of [
    new Response("{}", { headers: { "Content-Type": "application/json" } }),
    new Response(Buffer.alloc(0), { headers: { "Content-Type": "audio/mpeg" } }),
    new Response(Buffer.alloc(8 * 1024 * 1024 + 1), { headers: { "Content-Type": "audio/mpeg" } }),
  ]) {
    const service = speechService(elevenLabsFromEnvironment(env, async () => response));
    await assert.rejects(service.synthesize("a", body()), (e) => e.status === 502);
    await service.close();
  }
});

test("payment-required provider errors explain account limits without leaking the provider body", async () => {
  const service = speechService(elevenLabsFromEnvironment(env,
    async () => new Response("private account payment details", { status: 402 })));
  await assert.rejects(service.synthesize("a", body()), (e) => {
    assert.equal(e.status, 503);
    assert.equal(e.code, "TTS_PAYMENT_REQUIRED");
    assert.match(e.message, /요금제와 크레딧/);
    assert.doesNotMatch(e.message, /private account/);
    return true;
  });
  await service.close();
});

test("validation, explicit ElevenLabs consent, voice allowlist and disabled mode avoid paid calls", async () => {
  let calls = 0;
  const service = speechService(fake(async () => { calls++; return audio; }));
  for (const invalid of [null, [], body({ text: " " }), body({ text: "가".repeat(2001) }), body({ requestId: "bad" }), body({ voiceId: "arbitrary" }), body({ apiKey: "client-key" }), body({ voice: "toString" })])
    await assert.rejects(service.synthesize("a", invalid), (e) => e.status === 422);
  await assert.rejects(service.synthesize("a", body({ consent: false })), code("TTS_CONSENT_REQUIRED"));
  assert.equal(calls, 0);
  await assert.rejects(speechService().synthesize("a", body()), code("TTS_NOT_CONFIGURED"));
  await service.close();
});

test("same pending request coalesces, replays bytes, and cannot change text or voice", async () => {
  let finish, calls = 0;
  const service = speechService(fake(() => { calls++; return new Promise((r) => { finish = r; }); }));
  const request = body(), first = service.synthesize("a", request), second = service.synthesize("a", request);
  await assert.rejects(service.synthesize("a", { ...request, text: "변경" }), code("TTS_REQUEST_ID_REUSED"));
  await assert.rejects(service.synthesize("a", { ...request, voice: "bear" }), code("TTS_REQUEST_ID_REUSED"));
  finish(audio);
  assert.equal((await first).replayed, false);
  assert.equal((await second).replayed, true);
  assert.deepEqual((await service.synthesize("a", request)).audio, audio);
  assert.equal(calls, 1);
  await service.close();
});

test("principal isolation and cache expiry are explicit", async () => {
  let time = 0, calls = 0;
  const service = speechService(fake(async () => { calls++; return audio; }), { now: () => time });
  const request = body();
  await service.synthesize("a", request);
  await service.synthesize("b", request);
  assert.equal(calls, 2);
  time = 5 * 60_000 + 1;
  assert.equal((await service.synthesize("a", request)).replayed, false);
  assert.equal(calls, 3);
  await service.close();
});

test("failed requests retain a failure receipt without automatic retry", async () => {
  let calls = 0;
  const service = speechService(fake(async () => { calls++; throw new Error("secret key in network error"); }));
  const request = body();
  await assert.rejects(service.synthesize("a", request), code("TTS_PROVIDER_ERROR"));
  await assert.rejects(service.synthesize("a", request), code("TTS_PROVIDER_ERROR"));
  assert.equal(calls, 1);
  await service.close();
});

test("timeout and shutdown abort upstream and release work even for an unresponsive provider", async () => {
  let signal;
  const service = speechService(fake((input) => { signal = input.signal; return new Promise(() => {}); }), { timeoutMs: 20 });
  await assert.rejects(service.synthesize("a", body()), code("TTS_TIMEOUT"));
  assert.equal(signal.aborted, true);
  const pending = assert.rejects(service.synthesize("a", body()), code("TTS_UNAVAILABLE"));
  await service.close();
  await pending;
  assert.equal(service.config().available, false);
});

test("per-principal and global concurrency and per-minute rate limits bound paid calls", async () => {
  const service = speechService(fake(() => new Promise(() => {})));
  const pending = Array.from({ length: 4 }, (_, i) => assert.rejects(service.synthesize("p" + i, body()), code("TTS_UNAVAILABLE")));
  await assert.rejects(service.synthesize("p0", body()), code("TTS_BUSY"));
  await assert.rejects(service.synthesize("p5", body()), code("TTS_BUSY"));
  await service.close();
  await Promise.all(pending);
  const limited = speechService(fake());
  for (let i = 0; i < 20; i++) await limited.synthesize("a", body());
  await assert.rejects(limited.synthesize("a", body()), code("TTS_RATE_LIMITED"));
  for (let i = 0; i < 40; i++) await limited.synthesize("b" + i, body());
  await assert.rejects(limited.synthesize("c", body()), code("TTS_RATE_LIMITED"));
  await limited.close();
});
