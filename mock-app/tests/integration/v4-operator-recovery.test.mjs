import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { setImmediate as nextTurn } from "node:timers/promises";

const source = await readFile(
  new URL("../../web/operator.js", import.meta.url),
  "utf8",
);
const key = "waymate.operator.pending.v4";
const command = {
  schemaVersion: 4,
  runId: "run",
  runSeq: 1,
  expectedVersion: 4,
  commandId: "same-command",
  actor: "operator",
  type: "B_RESPONSE",
  target: {
    kind: "meeting",
    requestId: "request",
    connectionId: "connection",
    proposalId: "proposal",
  },
  payload: { decision: "accept" },
};

async function browser() {
  const memory = new Map([[key, JSON.stringify(command)]]),
    calls = [];
  class Element {
    children = [];
    textContent = "";
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren(...children) {
      this.children = children;
    }
  }
  const status = new Element(),
    requests = new Element();
  let interval,
    fault,
    applied = false;
  const state = {
    schemaVersion: 4,
    social: { pendingResponses: [], meeting: { status: "proposed" } },
  };
  await runInNewContext(`(async () => { ${source}\n })()`, {
    document: {
      hidden: false,
      getElementById: (id) => (id === "status" ? status : requests),
      createElement: () => new Element(),
    },
    localStorage: {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
      removeItem: (k) => memory.delete(k),
    },
    setInterval: (fn) => {
      interval = fn;
    },
    AbortSignal,
    fetch: async (path, options) => {
      calls.push({ path, method: options.method, body: options.body });
      const error = fault?.(path, options);
      if (error instanceof Error) throw error;
      if (error)
        return new Response(
          JSON.stringify({ error: { message: "injected failure" } }),
          { status: error },
        );
      if (options.method === "POST")
        return new Response(JSON.stringify({ state }));
      return new Response(
        JSON.stringify(
          path.startsWith("/api/commands/")
            ? { status: applied ? "applied" : "not_found", state }
            : state,
        ),
      );
    },
  });
  return {
    memory,
    calls,
    status,
    requests,
    poll: async () => {
      // A retry handler schedules its own poll in finally; let that poll finish.
      await nextTurn();
      await interval();
      await nextTurn();
    },
    fault: (fn) => {
      fault = fn;
    },
    applied: () => {
      applied = true;
    },
    retry: () =>
      requests.children.find((e) => e.textContent === "같은 요청 다시 전송"),
  };
}

for (const path of ["receipt", "state"])
  for (const code of [403, 500]) {
    test(`operator preserves unknown B response after ${path} GET ${code} and retries the same command`, async () => {
      const b = await browser();
      b.fault((url, options) =>
        options.method === "GET" &&
        (path === "receipt"
          ? url.startsWith("/api/commands/")
          : url.startsWith("/api/state"))
          ? code
          : null,
      );
      await b.poll();
      assert.equal(b.memory.get(key), JSON.stringify(command));
      assert.ok(b.retry());
      assert.equal(b.calls.filter((c) => c.method === "POST").length, 0);
      b.fault(null);
      await b.retry().onclick();
      assert.equal(b.memory.has(key), false);
      const posts = b.calls.filter((c) => c.method === "POST");
      assert.equal(posts.length, 1);
      assert.deepEqual(JSON.parse(posts[0].body), command);
    });
  }

for (const code of [409, 500])
  test(`operator closes a definitively rejected B response POST ${code}`, async () => {
    const b = await browser();
    b.fault((_path, options) => (options.method === "POST" ? code : null));
    await b.retry().onclick();
    assert.equal(b.memory.has(key), false);
    await b.poll();
    assert.equal(b.retry(), undefined);
  });

for (const failure of [503, new TypeError("response lost")])
  test(`operator retains B response after uncertain POST ${typeof failure === "number" ? failure : "timeout"}`, async () => {
    const b = await browser();
    b.fault((_path, options) => (options.method === "POST" ? failure : null));
    await b.retry().onclick();
    assert.equal(b.memory.get(key), JSON.stringify(command));
    b.fault(null);
    b.applied();
    const count = b.calls.filter((c) => c.method === "POST").length;
    await b.poll();
    assert.equal(b.memory.has(key), false);
    assert.equal(b.calls.filter((c) => c.method === "POST").length, count);
  });
