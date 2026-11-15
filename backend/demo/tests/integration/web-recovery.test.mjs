import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../server/http/server.mjs";
import { DemoClient } from "../../../../mobile-web/demo/shared/client.mjs";

test("web response loss: reload recovers receipt without posting again; missing receipt keeps exact request for explicit retry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "waymate-web-recovery-"));
  const app = await startServer({
    file: join(directory, "state.json"),
    port: 0,
  });
  const originalFetch = globalThis.fetch,
    originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  let mode = "after",
    posts = [];
  globalThis.fetch = async (path, options) => {
    if (options?.method === "POST") {
      posts.push(options.body);
      if (mode === "before") {
        mode = null;
        throw new TypeError("simulated offline before write");
      }
      const response = await originalFetch(
        `http://127.0.0.1:${app.port}${path}`,
        options,
      );
      if (mode === "after") {
        mode = null;
        await response.json();
        throw new TypeError("simulated response loss after commit");
      }
      return response;
    }
    return originalFetch(`http://127.0.0.1:${app.port}${path}`, options);
  };
  try {
    let client = new DemoClient();
    await assert.rejects(
      client.command("ONBOARDING_ANSWER", {
        questionId: "interests",
        inputSource: "typed",
        answerText: "cafe",
      }),
    );
    assert.ok(client.pending);
    client = new DemoClient();
    assert.equal(await client.recover(), true);
    assert.equal(client.pending, null);
    assert.equal(posts.length, 1);
    assert.equal(client.state.onboarding.interests.answerText, "cafe");
    mode = "before";
    await assert.rejects(
      client.command("ONBOARDING_ANSWER", {
        questionId: "interests",
        inputSource: "typed",
        answerText: "relaxed",
      }),
    );
    const pending = JSON.stringify(client.pending);
    client = new DemoClient();
    assert.equal(await client.recover(), false);
    assert.equal(JSON.stringify(client.pending), pending);
    await client.sendPending();
    assert.equal(posts[1], posts[2]);
    assert.equal(client.pending, null);
    assert.equal(client.state.onboarding.interests.answerText, "relaxed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("web refuses an old server projection without overwriting a pending command or draft", async () => {
  const originalFetch = globalThis.fetch,
    originalStorage = globalThis.localStorage;
  const values = new Map([
    ["waymate.pending.v2", '{"schemaVersion":2}'],
    ["waymate.draft.v3.test", "  원문 🌊\n  "],
  ]);
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ schemaVersion: 2, scope: "handoff-my-trip-v1" }),
  });
  try {
    const client = new DemoClient();
    await assert.rejects(client.read(), /서버 버전/);
    assert.equal(client.state, null);
    assert.equal(values.get("waymate.pending.v2"), '{"schemaVersion":2}');
    assert.equal(values.get("waymate.draft.v3.test"), "  원문 🌊\n  ");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
