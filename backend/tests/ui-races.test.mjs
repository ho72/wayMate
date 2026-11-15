import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openRepository } from "../server/store.mjs";
import { appHarness } from "./helpers/app-harness.mjs";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function setup(t, { fail = false, pause = "post" } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-ui-review-"));
  const repo = await openRepository(join(dir, "test.sqlite"));
  t.after(async () => {
    await repo.close();
    await rm(dir, { recursive: true, force: true });
  });
  const user = repo.createUser("ui-review", "unused-test-hash", "검수");
  repo.consent(user.id, true);
  const a = repo.newChat(user.id),
    b = repo.newChat(user.id),
    entered = deferred(),
    gate = deferred(),
    targets = [];
  let held = false;
  const api = {
    identity() {},
    pending() {
      return null;
    },
    async request(path, body) {
      if (path === "/api/chats") {
        const chat = repo.newChat(user.id);
        if (pause === "create" && !held) {
          held = true;
          entered.resolve();
          await gate.promise;
        }
        return { chat };
      }
      if (path.startsWith("/api/chats/")) {
        if (pause === "get" && held === "sent") {
          held = true;
          entered.resolve();
          await gate.promise;
        }
        return { chat: repo.chat(user.id, path.split("/").at(-1)) };
      }
      throw new Error("Unexpected test request " + path);
    },
    async send(chat, message) {
      targets.push(chat.id);
      const turn = repo.beginTurn(user.id, chat.id, {
        requestId: randomUUID(),
        message,
        expectedVersion: chat.version,
      });
      if (pause === "post" && !held) {
        held = true;
        entered.resolve();
        await gate.promise;
      }
      if (fail && targets.length === 1) {
        repo.failTurn(user.id, turn.id, turn.attempt, "AI_UNAVAILABLE");
        throw new Error("A 전송 실패");
      }
      repo.finishTurn(user.id, turn.id, turn.attempt, {
        reply: "검증용 응답",
        drafts: [],
        events: [],
      });
      if (pause === "get" && !held) held = "sent";
      return { turnId: turn.id };
    },
  };
  const h = await appHarness(api);
  h.S.user = repo.getUser(user.id);
  h.storage.set(`waymate.service.draft.${user.id}.${b.id}`, "B에 보관한 초안");
  await h.navigate("#chat/" + a.id);
  return { repo, user, a, b, entered, gate, targets, h, api };
}
for (const destination of ["B", "home", "new", "return-A"])
  for (const fail of [false, true]) {
    test(`late ${fail ? "failed" : "accepted"} POST cannot overwrite ${destination} or its input/stream`, async (t) => {
      const f = await setup(t, { fail }),
        { h } = f;
      h.input.value = "A에 전송";
      const pending = h.submit({ preventDefault() {} });
      await f.entered.promise;
      if (destination === "B") await h.navigate("#chat/" + f.b.id);
      if (destination === "home") await h.navigate("#home");
      if (destination === "new") {
        await h.newChat();
        await h.navigate("#chat");
      }
      if (destination === "return-A") {
        await h.navigate("#chat/" + f.b.id);
        await h.navigate("#chat/" + f.a.id);
      }
      h.input.value = "이 화면에서 작성 중인 초안";
      const screen = {
        view: h.S.view,
        id: h.S.chatId,
        chat: h.S.chat?.id,
        stream: h.S.stream,
        draws: h.stats.draws,
      };
      f.gate.resolve();
      await pending;
      assert.equal(h.S.view, screen.view);
      assert.equal(h.S.chatId, screen.id);
      assert.equal(h.S.chat?.id, screen.chat);
      assert.equal(h.input.value, "이 화면에서 작성 중인 초안");
      assert.equal(h.S.stream, screen.stream);
      assert.equal(h.stats.draws, screen.draws);
      assert.equal(h.stats.notices.length, 0);
      assert.equal(f.repo.chat(f.user.id, f.a.id).turns[0].message, "A에 전송");
      if (destination === "B") {
        await h.submit({ preventDefault() {} });
        assert.equal(f.targets.at(-1), f.b.id);
        const stream = h.S.stream;
        await stream.emit("done", { chat: f.repo.chat(f.user.id, f.b.id) });
        assert.equal(h.S.chatId, f.b.id);
        assert.equal(h.S.chat.id, f.b.id);
      }
    });
  }
test("a delayed chat GET cannot replace B after A POST is already accepted", async (t) => {
  const f = await setup(t, { pause: "get" }),
    { h } = f;
  h.input.value = "A에 전송";
  const pending = h.submit({ preventDefault() {} });
  await f.entered.promise;
  await h.navigate("#chat/" + f.b.id);
  h.input.value = "B 새 초안";
  f.gate.resolve();
  await pending;
  assert.equal(h.S.chatId, f.b.id);
  assert.equal(h.S.chat.id, f.b.id);
  assert.equal(h.input.value, "B 새 초안");
  assert.equal(h.S.stream, null);
  assert.equal(f.repo.chat(f.user.id, f.a.id).turns[0].status, "completed");
});
for (const destination of ["B", "home", "new"])
  test(`delayed new-chat creation preserves ${destination} while saving the originally submitted message`, async (t) => {
    const f = await setup(t, { pause: "create" }),
      { h } = f;
    await h.navigate("#chat");
    h.input.value = "새 대화의 원문";
    const pending = h.submit({ preventDefault() {} });
    await f.entered.promise;
    if (destination === "B") await h.navigate("#chat/" + f.b.id);
    if (destination === "home") await h.navigate("#home");
    if (destination === "new") await h.newChat();
    h.input.value = "새 화면의 입력";
    const screen = {
      view: h.S.view,
      id: h.S.chatId,
      chat: h.S.chat?.id,
      hash: h.context.location.hash,
    };
    f.gate.resolve();
    await pending;
    assert.equal(h.S.view, screen.view);
    assert.equal(h.S.chatId, screen.id);
    assert.equal(h.S.chat?.id, screen.chat);
    assert.equal(h.context.location.hash, screen.hash);
    assert.equal(h.input.value, "새 화면의 입력");
    assert.equal(
      f.repo.chat(f.user.id, f.targets[0]).turns[0].message,
      "새 대화의 원문",
    );
  });
test("an SSE completion for another conversation cannot replace the selected conversation", async (t) => {
  const f = await setup(t);
  await f.h.navigate("#chat/" + f.b.id);
  f.h.stream("wrong-turn", f.b.id);
  const stream = f.h.S.stream;
  await stream.emit("done", { chat: f.repo.chat(f.user.id, f.a.id) });
  assert.equal(f.h.S.chatId, f.b.id);
  assert.equal(f.h.S.chat.id, f.b.id);
});
for (const fail of [false, true])
  test(`the current conversation still ${fail ? "retains failed input" : "receives its accepted response"}`, async (t) => {
    const f = await setup(t, { fail }),
      { h } = f;
    h.input.value = "A의 원문";
    const pending = h.submit({ preventDefault() {} });
    await f.entered.promise;
    f.gate.resolve();
    await pending;
    assert.equal(h.S.chat.id, f.a.id);
    assert.equal(h.S.chatId, f.a.id);
    assert.equal(h.input.value, fail ? "A의 원문" : "");
    assert.equal(h.stats.notices.length, fail ? 1 : 0);
    if (!fail) {
      assert.ok(h.S.stream.url.includes(h.S.chat.turns[0].id));
      await h.S.stream.emit("done", { chat: f.repo.chat(f.user.id, f.a.id) });
      assert.equal(h.S.chat.turns[0].status, "completed");
    }
  });
for (const action of ["retry-turn", "resolve-pending"])
  for (const fail of [false, true])
    test(`${action} completion stays bound to A after moving to B (${fail ? "failure" : "success"})`, async (t) => {
      const f = await setup(t),
        { h } = f,
        entered = deferred(),
        gate = deferred();
      const turn = f.repo.beginTurn(f.user.id, f.a.id, {
        requestId: randomUUID(),
        message: "원래 A 메시지",
        expectedVersion: 0,
      });
      if (action === "retry-turn")
        f.repo.failTurn(f.user.id, turn.id, 1, "AI_UNAVAILABLE");
      const finish = async () => {
        if (action === "retry-turn") f.repo.retryTurn(f.user.id, turn.id, 1);
        entered.resolve();
        await gate.promise;
        if (fail) throw new Error("A 처리 실패");
        return { turnId: turn.id };
      };
      const original = f.api.request;
      f.api.request = async (path, ...rest) =>
        path.includes("/retry") ? finish() : original(path, ...rest);
      f.api.resolve = async (id) => {
        assert.equal(id, f.a.id);
        return finish();
      };
      await h.navigate("#chat/" + f.a.id);
      const pending = h.click(action, { id: turn.id, attempt: "1" });
      await entered.promise;
      await h.navigate("#chat/" + f.b.id);
      h.input.value = "B 초안 그대로";
      gate.resolve();
      await pending;
      assert.equal(h.S.chatId, f.b.id);
      assert.equal(h.S.chat.id, f.b.id);
      assert.equal(h.input.value, "B 초안 그대로");
      assert.equal(h.S.stream, null);
      assert.equal(h.stats.notices.length, 0);
    });
test("account switching during new-chat creation cannot send under the new identity", async (t) => {
  const f = await setup(t, { pause: "create" }),
    { h } = f;
  await h.navigate("#chat");
  h.input.value = "이전 계정의 입력";
  const pending = h.submit({ preventDefault() {} });
  await f.entered.promise;
  const other = f.repo.createUser(
    "other-review",
    "unused-test-hash",
    "다른 계정",
  );
  h.identity({ user: other, chats: [], trips: [], csrf: "test-csrf" });
  await h.navigate("#chat");
  h.input.value = "다른 계정의 초안";
  f.gate.resolve();
  await pending;
  assert.equal(f.targets.length, 0);
  assert.equal(h.S.user.id, other.id);
  assert.equal(h.input.value, "다른 계정의 초안");
});
