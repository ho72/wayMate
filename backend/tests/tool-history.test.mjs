import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openRepository } from "../server/store.mjs";
import { openAIAgent, agentRunner } from "../server/agent.mjs";
import { appHarness } from "./helpers/app-harness.mjs";
async function fixture(t, agent) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-tool-history-")),
    repo = await openRepository(join(dir, "test.sqlite"));
  const user = repo.createUser("tool-review", "unused-test-hash", "검수자");
  repo.consent(user.id, true);
  const chat = repo.newChat(user.id),
    turn = repo.beginTurn(user.id, chat.id, {
      requestId: randomUUID(),
      message: "안전한 도구 처리",
      expectedVersion: 0,
    });
  const runner = agentRunner(repo, agent);
  t.after(async () => {
    await runner.close();
    await repo.close();
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve) => {
    runner.launch(user.id, turn, "synthetic-session");
    runner.subscribe(user.id, turn.id, (type) => {
      if (type === "close") resolve();
    });
  });
  return { repo, user, chat, saved: repo.chat(user.id, chat.id).turns[0] };
}
for (const name of [
  "constructor",
  "toString",
  "hasOwnProperty",
  "__proto__",
  "undeclared_tool",
])
  test(`provider tool ${name} cannot execute or pollute persisted events`, async (t) => {
    let calls = 0;
    const outputs = [];
    const agent = openAIAgent({
      client: {
        responses: {
          async create(body) {
            calls++;
            outputs.push(
              ...body.input.filter((x) => x.type === "function_call_output"),
            );
            return (async function* () {
              if (calls <= 2)
                yield {
                  type: "response.completed",
                  response: {
                    status: "completed",
                    output: [
                      {
                        type: "function_call",
                        name: calls === 1 ? name : "get_profile",
                        arguments: "{}",
                        call_id: "call-" + calls,
                      },
                    ],
                  },
                };
              else {
                yield {
                  type: "response.output_text.delta",
                  delta: "정상 답변",
                };
                yield {
                  type: "response.completed",
                  response: { status: "completed", output: [] },
                };
              }
            })();
          },
        },
      },
    });
    const f = await fixture(t, agent);
    assert.equal(f.saved.status, "completed");
    assert.deepEqual(
      f.saved.events.map((x) => x.name),
      ["get_profile"],
    );
    assert.equal(typeof f.saved.events[0].label, "string");
    assert.ok(
      outputs.some((x) => x.call_id === "call-1" && JSON.parse(x.output).error),
    );
    const h = await appHarness({ identity() {} });
    h.S.user = f.user;
    assert.ok(
      h
        .turnView(f.repo.chat(f.user.id, f.chat.id).turns[0])
        .includes("정상 답변"),
    );
  });
test("runner independently rejects undeclared names before recording an event", async (t) => {
  const agent = {
    async run({ execute }) {
      for (const name of ["constructor", "__proto__", "toString"])
        await assert.rejects(
          execute(name, {}),
          (error) => error.code === "INVALID_TOOL",
        );
      await execute("get_saved_trips", {});
      return { reply: "계속 이어가는 답변" };
    },
  };
  const f = await fixture(t, agent);
  assert.equal(f.saved.status, "completed");
  assert.deepEqual(
    f.saved.events.map((x) => x.name),
    ["get_saved_trips"],
  );
});
test("old malformed tool labels survive database restart and conversation rendering", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "waymate-legacy-events-")),
    file = join(dir, "test.sqlite");
  let repo = await openRepository(file);
  t.after(async () => {
    await repo.close();
    await rm(dir, { recursive: true, force: true });
  });
  const user = repo.createUser("legacy-review", "unused-test-hash", "검수자");
  repo.consent(user.id, true);
  const chat = repo.newChat(user.id);
  const cases = [
    [{ name: "constructor" }],
    [{ label: null }],
    [{ label: 42 }],
    [null],
    { label: "not-an-array" },
    [{}, { label: "확인 <script>bad()</script> 있어요" }],
  ];
  for (const events of cases) {
    const turn = repo.beginTurn(user.id, chat.id, {
      requestId: randomUUID(),
      message: "원문",
      expectedVersion: repo.chat(user.id, chat.id).version,
    });
    repo.finishTurn(user.id, turn.id, 1, {
      reply: "저장한 답변",
      drafts: [],
      events,
    });
  }
  await repo.close();
  repo = await openRepository(file);
  const h = await appHarness({ identity() {} });
  h.S.user = repo.getUser(user.id);
  const turns = repo.chat(user.id, chat.id).turns;
  assert.equal(turns.length, cases.length);
  for (const turn of turns) {
    const html = h.turnView(turn);
    assert.ok(html.includes("저장한 답변"));
    assert.ok(!html.includes("<script>bad()"));
  }
});
