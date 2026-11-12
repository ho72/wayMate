import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../helpers/v4-fixture.mjs";
import { DemoClient } from "../../web/shared/client-v4.mjs";

async function browser(t) {
  const f = await fixture(t),
    memory = new Map([["waymate.clientId", f.id]]),
    fetch = globalThis.fetch,
    storage = globalThis.localStorage;
  let lose = false,
    failGet = false,
    posts = 0;
  const removals = [];
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => {
      removals.push(k);
      memory.delete(k);
    },
  };
  globalThis.fetch = async (path, options) => {
    if (failGet && options.method === "GET") throw new TypeError("offline");
    let r;
    if (options.method === "POST") {
      posts++;
      r = await f.post(JSON.parse(options.body));
      if (lose) {
        lose = false;
        throw new TypeError("response lost");
      }
    } else if (path.startsWith("/api/commands/")) {
      const u = new URL(path, "http://localhost");
      r = await f.receipt(
        "web",
        u.searchParams.get("runId"),
        u.pathname.split("/").at(-1),
      );
    } else r = await f.read();
    return new Response(JSON.stringify(r));
  };
  t.after(() => {
    globalThis.fetch = fetch;
    if (storage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = storage;
  });
  return {
    f,
    memory,
    removals,
    client: new DemoClient(),
    lose: () => {
      lose = true;
    },
    failGet: (v) => {
      failGet = v;
    },
    posts: () => posts,
    begin: async () => {
      const s = await f.read("operator");
      return f.send("RESET_BEGIN", {}, "operator", { runId: s.runId });
    },
  };
}

test("web reset clears only its current v4 drafts and ordinary outbox before cleanup ACK", async (t) => {
  const b = await browser(t);
  await b.f.prepare();
  await b.client.read();
  const old = b.client.state.runId;
  const draft = `waymate.draft.v4.${b.f.id}.${old}`,
    profile = `waymate.profileDraft.v4.${b.f.id}.${old}`;
  b.memory.set(draft, "private draft");
  b.memory.set(profile, "private profile draft");
  b.memory.set("waymate.pending.v3", "older pending");
  b.memory.set("unrelated", "keep");
  b.client.pending = { runId: old, type: "CONNECT_REQUEST" };
  b.memory.set("waymate.pending.v4", JSON.stringify(b.client.pending));
  await b.begin();
  await b.client.read();
  b.client.prepareResetCleanup();
  assert.equal(b.memory.has(draft), false);
  assert.equal(b.memory.has(profile), false);
  assert.equal(b.client.pending, null);
  assert.equal(b.memory.get("waymate.pending.v3"), "older pending");
  assert.equal(b.memory.get("unrelated"), "keep");
  const a = b.client.state.actionBindings.RESET_ACK;
  await b.client.command(a.commandType, a.payload, a.target);
  assert.notEqual(b.client.state.runId, old);
});

test("lost final web ACK response recovers across reload without another POST or another run", async (t) => {
  const b = await browser(t);
  await b.f.prepare();
  await b.begin();
  await b.client.read();
  b.client.prepareResetCleanup();
  const old = b.client.state.runId,
    a = b.client.state.actionBindings.RESET_ACK;
  b.lose();
  await assert.rejects(b.client.command(a.commandType, a.payload, a.target));
  assert.ok(b.client.pending);
  const count = b.posts(),
    c = new DemoClient();
  assert.equal(await c.recover(), true);
  assert.equal(c.pending, null);
  assert.equal(b.posts(), count);
  assert.equal(c.state.runSeq, 2);
  assert.notEqual(c.state.runId, old);
  await c.read();
  assert.equal(c.state.runSeq, 2);
});

test("reset ACK lookup failure preserves its exact durable command for retry", async (t) => {
  const b = await browser(t);
  await b.f.prepare();
  await b.begin();
  await b.client.read();
  b.client.prepareResetCleanup();
  const a = b.client.state.actionBindings.RESET_ACK;
  b.lose();
  await assert.rejects(b.client.command(a.commandType, a.payload, a.target));
  const pending = JSON.stringify(b.client.pending);
  b.failGet(true);
  await assert.rejects(b.client.recover());
  assert.equal(JSON.stringify(b.client.pending), pending);
  assert.equal(b.memory.get("waymate.pending.v4"), pending);
  b.failGet(false);
  await b.client.recover();
  assert.equal(b.client.pending, null);
});

test("active vehicle reset clears browser drafts without requiring a browser ACK", async (t) => {
  const b = await browser(t);
  await b.f.connect();
  await b.f.activate();
  await b.client.read();
  const old = b.client.state.runId,
    key = `waymate.draft.v4.${b.f.id}.${old}`;
  b.memory.set(key, "private");
  await b.begin();
  await b.client.read();
  b.client.prepareResetCleanup();
  assert.equal(b.client.state.actionBindings.RESET_ACK, undefined);
  assert.equal(b.memory.has(key), false);
  assert.equal(b.posts(), 0);
});

test("a stale browser returning after several completed resets clears old v4 state without submitting anything", async (t) => {
  const b = await browser(t);
  await b.f.prepare();
  await b.begin();
  await b.client.read();
  b.client.prepareResetCleanup();
  const old = b.client.state.runId,
    a = b.client.state.actionBindings.RESET_ACK;
  await b.client.command(a.commandType, a.payload, a.target);
  await b.begin();
  await b.begin();
  const key = `waymate.draft.v4.${b.f.id}.${old}`;
  b.memory.set(key, "late edit in stale tab");
  b.memory.set("waymate.lastRun.v4", old);
  b.memory.set(
    "waymate.pending.v4",
    JSON.stringify({ runId: old, type: "CONNECT_REQUEST" }),
  );
  const count = b.posts(),
    c = new DemoClient();
  await c.read();
  assert.equal(c.state.runSeq, 4);
  assert.equal(c.pending, null);
  assert.equal(b.memory.has(key), false);
  assert.equal(b.posts(), count);
});

test("an upgraded browser without a last-run pointer clears its completed drafts on first read", async (t) => {
  const b = await browser(t);
  await b.f.prepare();
  await b.begin();
  await b.client.read();
  const old = b.client.state.runId;
  const binding = b.client.state.actionBindings.RESET_ACK;
  await b.client.command(binding.commandType, binding.payload, binding.target);
  const current = b.client.state.runId;
  const draft = `waymate.draft.v4.${b.f.id}.${old}`;
  const profile = `waymate.profileDraft.v4.${b.f.id}.${old}`;
  const keep = `waymate.draft.v4.${b.f.id}.${current}`;
  const other = `waymate.draft.v4.another-client.${old}`;
  for (const key of [draft, profile, keep, other]) b.memory.set(key, "draft");
  b.memory.delete("waymate.lastRun.v4");
  assert.equal(b.memory.has("waymate.pending.v4"), false);
  const count = b.posts();
  await new DemoClient().read();
  assert.equal(b.memory.has(draft), false);
  assert.equal(b.memory.has(profile), false);
  assert.equal(b.memory.get(keep), "draft");
  assert.equal(b.memory.get(other), "draft");
  assert.equal(b.posts(), count);
});

test("ordinary polls do not repeat completed-run or active-reset draft cleanup", async (t) => {
  const b = await browser(t);
  await b.f.prepare();
  await b.begin();
  await b.client.read();
  const waitingCount = b.removals.length;
  for (let i = 0; i < 4; i++) await b.client.read();
  assert.equal(b.removals.length, waitingCount);
  const binding = b.client.state.actionBindings.RESET_ACK;
  await b.client.command(binding.commandType, binding.payload, binding.target);
  const completedCount = b.removals.length;
  for (let i = 0; i < 4; i++) await b.client.read();
  assert.equal(b.removals.length, completedCount);
  await b.begin();
  await b.client.read();
  assert.ok(b.removals.length > completedCount);
});
