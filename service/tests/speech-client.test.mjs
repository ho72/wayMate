import { test } from "node:test";
import assert from "node:assert/strict";
import { ServerSpeech, speechChunks } from "../web/speech-client.mjs";
import { ServiceClient } from "../web/client.mjs";
const tick = () => new Promise((r) => setImmediate(r));
function fixture(request = async () => new Blob(["audio"], { type: "audio/mpeg" })) {
  const events = [], audios = [], revoked = [];
  const player = new ServerSpeech({ request, changed: (...e) => events.push(e),
    createAudio() {
      const audio = { async play() {}, pause() { this.paused = true; }, removeAttribute() {}, load() {} };
      audios.push(audio); return audio;
    },
    urls: { createObjectURL: () => "blob:" + audios.length, revokeObjectURL: (url) => revoked.push(url) },
  });
  return { player, events, audios, revoked };
}

test("long Unicode replies split into bounded sequential chunks without cutting emoji", async () => {
  const text = "같이 가요 😀. ".repeat(400);
  assert.ok(speechChunks(text).every((s) => [...s].length <= 1500));
  assert.equal(speechChunks("😀".repeat(1501)).map((s) => [...s].length).join(","), "1500,1");
  const requests = [];
  const f = fixture(async (b) => { requests.push(b); return new Blob(["audio"]); });
  const done = f.player.speak("가".repeat(1600), "bear");
  await tick(); assert.equal(requests.length, 1);
  f.audios[0].onended(); await tick(); assert.equal(requests.length, 2);
  f.audios[1].onended(); await done;
  assert.equal(requests[0].voice, "bear"); assert.equal(requests[0].consent, true);
  assert.notEqual(requests[0].requestId, requests[1].requestId);
  assert.equal(f.revoked.length, 2);
});

test("stop during download aborts transport and discards a late response", async () => {
  let finish, signal;
  const f = fixture((_b, s) => { signal = s; return new Promise((r) => { finish = r; }); });
  const done = f.player.speak("안녕", "dragon");
  f.player.stop(); finish(new Blob(["late"])); await done;
  assert.equal(signal.aborted, true); assert.equal(f.audios.length, 0);
});

test("repeated listen clicks during preparation share the current request", async () => {
  let calls = 0, finish;
  const f = fixture(() => { calls++; return new Promise((r) => { finish = r; }); });
  const done = f.player.speak("안녕", "dragon");
  await f.player.speak("안녕", "dragon");
  assert.equal(calls, 1);
  f.player.stop(); finish(new Blob(["audio"])); await done;
});

test("stop during playback releases audio and prevents the next chunk", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return new Blob(["audio"]); });
  const done = f.player.speak("가".repeat(1600), "dragon");
  await tick(); f.player.stop(); await done;
  assert.equal(calls, 1); assert.equal(f.audios[0].paused, true); assert.equal(f.revoked.length, 1);
  const restarted = f.player.speak("가".repeat(1600), "dragon");
  await tick(); assert.equal(calls, 2);
  f.player.stop(); await restarted;
});

test("changed account/view predicate rejects late audio without playback", async () => {
  let current = true, finish;
  const f = fixture(() => new Promise((r) => { finish = r; }));
  const done = f.player.speak("안녕", "dragon", () => current);
  current = false; finish(new Blob(["late"])); await done;
  assert.equal(f.audios.length, 0);
});

test("autoplay denial exposes resume using the same audio without another paid request", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return new Blob(["audio"]); });
  const make = f.player.createAudio;
  f.player.createAudio = () => {
    const audio = make(); let plays = 0;
    audio.play = async () => { if (++plays === 1) throw new DOMException("blocked", "NotAllowedError"); };
    return audio;
  };
  const done = f.player.speak("안녕", "dragon");
  await tick(); assert.ok(f.events.some(([phase]) => phase === "paused"));
  f.player.resume(); await tick(); f.audios[0].onended(); await done;
  assert.equal(calls, 1);
});

test("mobile speech transport uses CSRF and binary response; identity changes reject late bytes", async () => {
  let finish;
  const api = new ServiceClient({ storage: {}, fetchImpl: async (_path, options) => {
    assert.equal(options.credentials, "same-origin"); assert.equal(options.headers["X-CSRF-Token"], "csrf-a");
    return new Promise((r) => { finish = r; });
  } });
  api.identity({ id: "a" }, "csrf-a");
  const pending = api.speech({ text: "안녕" }, new AbortController().signal);
  api.identity({ id: "b" }, "csrf-b");
  finish(new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }));
  await assert.rejects(pending, /계정이 바뀌었어요/);
});
