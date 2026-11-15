import { test } from "node:test";
import assert from "node:assert/strict";
import { ConsultationClient } from "../../../../mobile-web/demo/shared/consultation-v1.mjs";
import { DemoClient } from "../../../../mobile-web/demo/shared/client-v4.mjs";

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
  assert.throws(() => a.useDemo(), /저장 결과/);
  const reloaded = new ConsultationClient(api);
  await reloaded.send("다른 텍스트로 덮지 않음");
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(reloaded.pending, null);
  assert.equal(reloaded.draft, "");
});

test("known first AI failures unlock explicit demo fallback and preserve the original draft", async (t) => {
  for (const [status, code] of [
    [503, "AI_UNAVAILABLE"],
    [503, "AI_TIMEOUT"],
    [503, "AI_INCOMPLETE"],
    [503, "AI_INVALID_RESPONSE"],
    [503, "AI_NOT_CONFIGURED"],
    [422, "AI_REFUSED"],
  ]) {
    await t.test(code, async (t) => {
      storage(t);
      const oldFetch = globalThis.fetch;
      t.after(() => {
        globalThis.fetch = oldFetch;
      });
      const api = new DemoClient();
      api.state = {
        schemaVersion: 4,
        scope: "mobile-meeting-v4",
        runId: "first-run",
        allowedActions: ["ONBOARDING_ANSWER"],
      };
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: { code, message: "test provider failure" },
            state: api.state,
          }),
          { status },
        );
      const client = new ConsultationClient(api);
      client.enable();
      await assert.rejects(client.send("돌아가도 보존할 원문"));
      assert.equal(client.pending, null);
      const reloaded = new ConsultationClient(api);
      assert.equal(reloaded.useDemo(), "돌아가도 보존할 원문");
      assert.equal(reloaded.enabled, false);
      assert.equal(reloaded.draft, "돌아가도 보존할 원문");
      assert.ok(api.state.allowedActions.includes("ONBOARDING_ANSWER"));
    });
  }
});

test("unknown store failure keeps the pending AI request and refuses a potentially unsafe demo switch", async (t) => {
  storage(t);
  const oldFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = oldFetch;
  });
  const api = new DemoClient();
  api.state = { schemaVersion: 4, scope: "mobile-meeting-v4", runId: "run" };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: { code: "UNAVAILABLE", message: "unknown commit" },
      }),
      { status: 503 },
    );
  const client = new ConsultationClient(api);
  client.enable();
  await assert.rejects(client.send("미확인 원문"));
  assert.ok(client.pending);
  assert.equal(client.pending.message, "미확인 원문");
  assert.throws(() => client.useDemo(), /저장 결과/);
  assert.equal(client.enabled, true);
});

test("completed AI conversation cannot silently switch to demo and a pre-send switch never clears an unrelated command outbox", (t) => {
  storage(t);
  const api = {
    id: "owner",
    state: { runId: "run" },
    pending: { commandId: "existing-command" },
  };
  const client = new ConsultationClient(api);
  client.enable();
  client.setDraft("아직 보내지 않은 원문");
  assert.equal(client.useDemo(), "아직 보내지 않은 원문");
  assert.equal(api.pending.commandId, "existing-command");
  api.state.consultation = {
    revision: 1,
    turns: [{ requestId: "saved-turn" }],
  };
  assert.throws(() => client.useDemo(), /저장 결과/);
  assert.equal(client.enabled, true);
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
