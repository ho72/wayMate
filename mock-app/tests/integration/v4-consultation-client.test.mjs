import { test } from "node:test";
import assert from "node:assert/strict";
import { ConsultationClient } from "../../web/shared/consultation-v1.mjs";
import { DemoClient } from "../../web/shared/client-v4.mjs";

function storage(t) {
  const old = globalThis.localStorage,
    values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  t.after(() => {
    if (old === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = old;
  });
  return values;
}

test("AI browser preserves exact message ID/body across a lost response and explicit retry after reload", async (t) => {
  storage(t);
  const sent = [];
  const api = {
    id: "owner",
    state: { runId: "run-one" },
    request: async (path, request) => {
      assert.equal(path, "/api/consultation/turns");
      sent.push(structuredClone(request));
      if (sent.length === 1) throw new TypeError("connection lost");
      return { state: api.state };
    },
  };
  const a = new ConsultationClient(api);
  a.enable();
  await assert.rejects(a.send("입력한 원문 ㅋㅋ"));
  assert.equal(a.draft, "입력한 원문 ㅋㅋ");
  assert.ok(a.pending);
  const reloaded = new ConsultationClient(api);
  await reloaded.send("다른 텍스트로 덮지 않음");
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(reloaded.pending, null);
  assert.equal(reloaded.draft, "");
});

test("AI browser observes an already saved response without automatically posting again", async (t) => {
  storage(t);
  let calls = 0;
  const api = {
    id: "owner",
    state: { runId: "one" },
    request: async () => {
      calls++;
      throw new TypeError("lost");
    },
  };
  const client = new ConsultationClient(api);
  client.enable();
  await assert.rejects(client.send("원문"));
  api.state.consultation = {
    revision: 1,
    turns: [{ requestId: client.pending.requestId }],
  };
  client.observe();
  assert.equal(client.pending, null);
  assert.equal(calls, 1);
});

test("reset clears AI outbox/raw drafts and cannot resurrect them from a late successful HTTP response", async (t) => {
  const values = storage(t);
  const api = new DemoClient();
  api.state = { runId: "old" };
  let finish;
  api.request = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const client = new ConsultationClient(api);
  client.enable();
  const response = client.send("이전 원문");
  const oldKey = client.key();
  assert.ok(values.has(oldKey));
  api.clearRunDrafts("old");
  api.state = { runId: "new" };
  finish({ state: api.state });
  await response;
  assert.ok(!values.has(oldKey));
  assert.equal(client.pending, null);
  assert.equal(client.enabled, false);
});

test("definitive AI refusal keeps editable input but clears the old request ID", async (t) => {
  storage(t);
  const api = {
    id: "owner",
    state: { runId: "run" },
    request: async () => {
      throw Object.assign(new Error("refused"), { definitive: true });
    },
  };
  const client = new ConsultationClient(api);
  client.enable();
  await assert.rejects(client.send("수정할 원문"));
  assert.equal(client.pending, null);
  assert.equal(client.draft, "수정할 원문");
});
