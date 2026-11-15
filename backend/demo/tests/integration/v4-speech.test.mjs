import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { startServer } from "../../server/v4/http.mjs";
import { emptySummary } from "../../shared/config/protocol-v4.mjs";
const audio = Buffer.from("ID3-demo-test");
const body = () => ({ requestId: randomUUID(), text: "곧 목적지에 도착해요.", consent: true });
async function fixture(t, enabled = true, synthesize = async () => audio) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-tts-"));
  let calls = 0;
  const app = await startServer({ file: join(dir, "state.json"), port: 0,
    speechProvider: enabled ? { voices: ["default", "dragon", "bear"], async synthesize(input) { calls++; return synthesize(input); } } : null,
    aiProvider: { async generate() {
      const { summarySource, ...summary } = emptySummary();
      return { reply: "테스트 답변", introduction: "테스트 소개", summary };
    } },
  });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const id = randomUUID(), base = `http://127.0.0.1:${app.port}`;
  async function request(path, payload, actor = "web", extra = {}) {
    return fetch(base + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: { "X-Demo-Actor": actor, "X-Demo-Client-Id": id,
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }), ...extra },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  }
  const state = async () => (await request("/api/state?view=web")).json();
  async function claim() {
    const s = await state();
    const response = await request("/api/consultation/turns", {
      runId: s.runId, requestId: randomUUID(), expectedRevision: 0, message: "바다가 좋아요", consent: true,
    });
    assert.equal(response.status, 200);
  }
  async function reset() {
    const s = await state();
    return request("/api/commands", {
      schemaVersion: 4, runId: s.runId, runSeq: s.runSeq, expectedVersion: s.version,
      commandId: randomUUID(), actor: "operator", type: "RESET_BEGIN", target: { runId: s.runId }, payload: {},
    }, "operator");
  }
  return { request, base, calls: () => calls, id, claim, reset };
}

test("v4 mobile and Pleos share the TTS contract and keep replay caches separate", async (t) => {
  const f = await fixture(t), payload = body();
  const config = await f.request("/api/tts/config");
  assert.equal((await config.json()).available, true);
  for (const actor of ["web", "car"]) {
    const response = await f.request("/api/tts", payload, actor);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio);
    const replay = await f.request("/api/tts", payload, actor);
    assert.equal(replay.headers.get("X-TTS-Replayed"), "true");
  }
  assert.equal(f.calls(), 2);
});

test("v4 TTS rejects operator, cross-origin requests, malformed JSON, missing consent and oversized input", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/api/tts", body(), "operator")).status, 403);
  assert.equal((await f.request("/api/tts", body(), "web", { Origin: "https://other.test" })).status, 403);
  assert.equal((await f.request("/api/tts", body(), "car", { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await f.request("/api/tts", { ...body(), consent: false })).status, 403);
  assert.equal((await f.request("/api/tts", { ...body(), text: "가".repeat(2001) })).status, 422);
  assert.equal((await f.request("/api/tts", { ...body(), text: "가".repeat(20000) })).status, 413);
  const invalid = await fetch(f.base + "/api/tts", { method: "POST",
    headers: { "X-Demo-Actor": "web", "X-Demo-Client-Id": f.id, "Content-Type": "application/json" }, body: "{" });
  assert.equal(invalid.status, 400);
  assert.equal(f.calls(), 0);
});

test("v4 TTS is an optional capability independent of the LLM", async (t) => {
  const f = await fixture(t, false);
  assert.equal((await (await f.request("/api/tts/config")).json()).available, false);
  assert.equal((await f.request("/api/tts", body())).status, 503);
  assert.equal(f.calls(), 0);
});

test("v4 TTS checks current owner after the coordinator replaces its state", async (t) => {
  const f = await fixture(t);
  await f.claim();
  const r = await f.request("/api/tts", body(), "web", { "X-Demo-Client-Id": randomUUID() });
  assert.equal(r.status, 403);
  assert.equal(f.calls(), 0);
});

test("v4 reset blocks late audio and new TTS requests", async (t) => {
  let finish, entered;
  const ready = new Promise((r) => { entered = r; });
  const f = await fixture(t, true, () => { entered(); return new Promise((r) => { finish = r; }); });
  await f.claim();
  const pending = f.request("/api/tts", body());
  await ready;
  assert.equal((await f.reset()).status, 200);
  finish(audio);
  assert.equal((await pending).status, 403);
  assert.equal((await f.request("/api/tts", body())).status, 403);
  assert.equal(f.calls(), 1);
});
