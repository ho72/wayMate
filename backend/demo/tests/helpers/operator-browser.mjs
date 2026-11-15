import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { setImmediate as nextTurn } from "node:timers/promises";

const source = await readFile(
  new URL("../../../../mobile-web/demo/operator.js", import.meta.url),
  "utf8",
);
export const key = "waymate.operator.pending.v4";
export const command = {
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

export async function browser() {
  const memory = new Map([[key, JSON.stringify(command)]]),
    calls = [];
  class Element {
    children = [];
    textContent = "";
    append(...children) {
      this.children.push(...children);
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
    replaceChildren(...children) {
      this.children = children;
    }
  }
  const status = new Element(),
    requests = new Element();
  const elements = new Map([
    ["status", status],
    ["requests", requests],
    ...[
      "journey-controls",
      "navigation-controls",
      "begin-reset",
      "run-meta",
      "reset-summary",
      "reset-participants",
      "retry-reset",
      "reset-dialog",
      "confirm-reset",
      "cancel-reset",
    ].map((id) => [id, new Element()]),
  ]);
  const appliedIds = new Set();
  let interval, fault;
  const state = {
    schemaVersion: 4,
    social: { pendingResponses: [], meeting: { status: "proposed" } },
  };
  await runInNewContext(`(async () => { ${source}\n })()`, {
    document: {
      hidden: false,
      getElementById: (id) => elements.get(id) || null,
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
    crypto: globalThis.crypto,
    structuredClone,
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
            ? {
                status: appliedIds.has(path.split("/").at(-1).split("?")[0])
                  ? "applied"
                  : "not_found",
                state,
              }
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
    applied: (id = command.commandId) => {
      appliedIds.add(id);
    },
    setState: (patch) => Object.assign(state, patch),
    element: (id) => elements.get(id),
    retry: () =>
      requests.children.find((e) => e.textContent === "같은 요청 다시 전송"),
  };
}
