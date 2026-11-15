import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { coordinator } from "../../server/v4/commands.mjs";
import { initialState } from "../../server/v4/state.mjs";
import { emptySummary } from "../../shared/config/protocol.mjs";
import { DemoClient } from "../../../../mobile-web/demo/shared/client-v4.mjs";
test("v4 browser recovers a lost cancellation response by receipt; original connection never revives", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "waymate-v4-web-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const app = coordinator(join(dir, "s.json"), initialState(), {
    now: () => 1000,
  });
  const memory = new Map(),
    originalFetch = globalThis.fetch,
    originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
  let lost = null,
    posts = 0;
  globalThis.fetch = async (path, opts) => {
    let result;
    const id = opts.headers["X-Demo-Client-Id"];
    if (opts.method === "POST") {
      posts++;
      const c = JSON.parse(opts.body);
      result = await app.command(c, "web", id);
      if (lost === c.type) {
        lost = null;
        throw new TypeError("lost response");
      }
    } else if (path.startsWith("/api/commands/")) {
      const url = new URL(path, "http://localhost");
      result = await app.receipt(
        "web",
        id,
        url.searchParams.get("runId"),
        url.pathname.split("/").at(-1),
      );
    } else result = await app.read("web", id);
    return new Response(JSON.stringify(result), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  });
  const client = new DemoClient();
  for (const questionId of [
    "interests",
    "activity",
    "conversation",
    "expression",
  ])
    await client.command("ONBOARDING_ANSWER", {
      questionId,
      answerText: "직접 입력",
      inputSource: "typed",
    });
  await client.command("PROFILE_CONFIRM", {
    alias: "파도",
    avatarId: "a-01",
    confirmedSummary: emptySummary(),
  });
  await client.command("TRIP_SAVE", {
    presetId: "gangneung-01",
    shareSummaryApproved: false,
  });
  await client.command("PROFILE_PUBLISH", {
    profileVersion: 1,
    approvedFields: ["alias", "avatarId"],
  });
  await client.command("TRIP_SHARE_CONFIRM", {
    tripVersion: 1,
    approved: true,
  });
  let b = client.state.actionBindings.CONNECT_REQUEST;
  lost = "CONNECT_REQUEST";
  await assert.rejects(client.command(b.commandType, b.payload, b.target));
  assert.ok(client.pending);
  lost = "CANCEL_PENDING_COMMAND";
  await assert.rejects(client.cancelPending());
  assert.ok(client.cancelRequest);
  const count = posts;
  const reloaded = new DemoClient();
  assert.equal(await reloaded.recover(), true);
  assert.equal(posts, count);
  assert.equal(reloaded.state.social.connection.status, "cancelled");
  assert.equal(reloaded.pending, null);
  assert.equal(reloaded.cancelRequest, null);
});
test("v4 refuses a v3 server and preserves older outbox and drafts", async (t) => {
  const fetch = globalThis.fetch,
    storage = globalThis.localStorage,
    m = new Map([
      ["waymate.pending.v3", '{"commandId":"old"}'],
      ["waymate.draft.v3.sample", "old draft"],
    ]);
  globalThis.localStorage = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ schemaVersion: 3, scope: "preparation-v3" }));
  t.after(() => {
    globalThis.fetch = fetch;
    if (storage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = storage;
  });
  const c = new DemoClient();
  await assert.rejects(c.read(), /서버 버전/);
  assert.equal(m.get("waymate.pending.v3"), '{"commandId":"old"}');
  assert.equal(m.get("waymate.draft.v3.sample"), "old draft");
});
