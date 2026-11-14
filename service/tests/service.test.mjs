import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { startService } from "../server/http.mjs";
import { openAIAgent } from "../server/agent.mjs";
import { validate } from "../server/contracts.mjs";
import { ServiceClient } from "../web/client.mjs";
const plan = () => ({
  title: "느긋한 바다 여행",
  destination: "강릉",
  startDate: null,
  endDate: null,
  summary: "산책하고 쉬어가는 계획이에요.",
  days: [
    {
      dayNumber: 1,
      date: null,
      stops: [
        {
          time: null,
          title: "해변 산책",
          description: "천천히 걷고 여유롭게 쉬어요.",
          category: "walk",
          placeQuery: "강릉 해변",
        },
      ],
    },
  ],
  notes: ["영업 정보는 출발 전에 확인해 주세요."],
});
const preference = () => ({
  interests: ["바다 산책", "조용한 카페"],
  travelStyle: "여유롭게",
  about: "걷고 쉬는 여행을 좋아해요.",
});
const normalAgent = {
  name: "test-double",
  async run({ onDelta }) {
    onDelta("함께 알아가 보자.");
    return { reply: "함께 알아가 보자." };
  },
};
async function fixture(t, agent = normalAgent) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-service-")),
    file = join(dir, "service.sqlite");
  let app = await startService({ file, port: 0, agent });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const account = () => ({ cookie: "", csrf: "", id: null });
  async function request(
    user,
    path,
    body,
    method = body === undefined ? "GET" : "POST",
    headers = {},
  ) {
    const base = `http://127.0.0.1:${app.port}`;
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: base,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(user.cookie ? { Cookie: user.cookie } : {}),
        ...(user.csrf ? { "X-CSRF-Token": user.csrf } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000),
    });
    if (response.headers.get("set-cookie"))
      user.cookie = response.headers.get("set-cookie").split(";")[0];
    const data = await response.json();
    if (data.csrf) {
      user.csrf = data.csrf;
      user.id = data.user.id;
    }
    return { status: response.status, data, headers: response.headers };
  }
  async function register(handle = "traveler01") {
    const user = account();
    const r = await request(user, "/api/auth/register", {
      handle,
      password: "A-test-password-2026",
      displayName: "검증 여행자",
    });
    assert.equal(r.status, 200);
    return user;
  }
  async function chat(user) {
    const r = await request(user, "/api/chats", {});
    assert.equal(r.status, 201);
    return r.data.chat;
  }
  async function send(
    user,
    c,
    message = "바다를 걷고 싶어",
    requestId = randomUUID(),
  ) {
    return request(user, `/api/chats/${c.id}/messages`, {
      requestId,
      message,
      expectedVersion: c.version,
    });
  }
  async function events(user, id) {
    const response = await fetch(
      `http://127.0.0.1:${app.port}/api/turns/${id}/events`,
      { headers: { Cookie: user.cookie }, signal: AbortSignal.timeout(8000) },
    );
    assert.equal(response.status, 200);
    return response.text();
  }
  return {
    request,
    register,
    chat,
    send,
    events,
    account,
    file,
    get app() {
      return app;
    },
    async restart() {
      await app.close();
      app = await startService({ file, port: 0, agent });
    },
  };
}

test("real accounts use HttpOnly cookies, hashed passwords, expiry, login rotation and logout revocation", async (t) => {
  const f = await fixture(t),
    u = await f.register();
  const session = await f.request(u, "/api/session");
  assert.equal(session.data.user.handle, "traveler01");
  assert.ok(!JSON.stringify(session.data).includes("password"));
  const bytes = await readFile(f.file);
  assert.ok(!bytes.includes(Buffer.from("A-test-password-2026")));
  const other = f.account();
  assert.equal(
    (
      await f.request(other, "/api/auth/login", {
        handle: "traveler01",
        password: "wrong",
      })
    ).status,
    401,
  );
  const old = u.cookie,
    login = await f.request(u, "/api/auth/login", {
      handle: "traveler01",
      password: "A-test-password-2026",
    });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
  assert.notEqual(u.cookie, old);
  assert.equal((await f.request({ cookie: old }, "/api/chats")).status, 401);
  const token = u.cookie;
  assert.equal((await f.request(u, "/api/auth/logout", {})).status, 200);
  assert.equal((await f.request({ cookie: token }, "/api/chats")).status, 401);
});

test("accounts, raw chats, trip drafts and confirmations never cross owner boundaries", async (t) => {
  const f = await fixture(t, {
    async run({ execute, onDelta }) {
      await execute("propose_trip", plan());
      onDelta("초안이야.");
      return { reply: "초안이야." };
    },
  });
  const a = await f.register("traveler-a"),
    b = await f.register("traveler-b"),
    c = await f.chat(a);
  assert.equal((await f.send(a, c)).status, 403);
  await f.request(a, "/api/consent", { accepted: true });
  const sent = await f.send(a, c);
  assert.equal(sent.status, 202);
  await f.events(a, sent.data.turnId);
  const current = (await f.request(a, `/api/chats/${c.id}`)).data.chat,
    draft = current.turns[0].drafts[0];
  assert.equal(draft.status, "proposed");
  assert.equal((await f.request(b, `/api/chats/${c.id}`)).status, 404);
  assert.equal(
    (await f.request(b, `/api/turns/${sent.data.turnId}/cancel`, {})).status,
    404,
  );
  assert.equal(
    (await f.request(b, `/api/drafts/${draft.id}/confirm`, {})).status,
    404,
  );
  assert.equal((await f.request(a, "/api/trips")).data.trips.length, 0);
  const confirmed = await f.request(a, `/api/drafts/${draft.id}/confirm`, {});
  assert.equal(confirmed.data.trips.length, 1);
  const repeat = await f.request(a, `/api/drafts/${draft.id}/confirm`, {});
  assert.equal(repeat.data.result.replayed, true);
  assert.equal(repeat.data.trips.length, 1);
  assert.equal((await f.request(b, "/api/trips")).data.trips.length, 0);
  assert.ok(
    !JSON.stringify((await f.request(b, "/api/session")).data).includes(
      "바다를 걷고",
    ),
  );
});

test("mutations require same origin and session CSRF; role headers and forged ownership grant no access", async (t) => {
  const f = await fixture(t),
    u = await f.register();
  assert.equal(
    (await f.request(u, "/api/chats", {}, "POST", { "X-CSRF-Token": "" }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.request(u, "/api/chats", {}, "POST", {
        Origin: "https://unrelated.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(f.account(), "/api/chats", {}, "POST", {
        "X-Demo-Actor": "web",
        "X-Demo-Client-Id": u.id,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.request(u, "/api/chats", {}, "POST", {
        "X-CSRF-Token": "x".repeat(43),
      })
    ).status,
    403,
  );
});

test("streamed responses and confirmed preference memory survive restart with no extra generation on replay", async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    async run({ execute, onDelta }) {
      calls++;
      await execute("get_profile", {});
      await execute("propose_preferences", preference());
      onDelta("취향을 ");
      onDelta("정리했어.");
      return { reply: "취향을 정리했어." };
    },
  });
  const u = await f.register();
  await f.request(u, "/api/consent", { accepted: true });
  const c = await f.chat(u),
    id = randomUUID();
  const first = await f.send(u, c, "이 취향을 기억해 줘", id);
  const stream = await f.events(u, first.data.turnId);
  assert.match(stream, /event: done/);
  const before = (await f.request(u, `/api/chats/${c.id}`)).data.chat;
  assert.equal(before.turns[0].reply, "취향을 정리했어.");
  assert.deepEqual(
    (await f.request(u, "/api/session")).data.user.profile.interests,
    [],
  );
  await f.request(u, `/api/drafts/${before.turns[0].drafts[0].id}/confirm`, {});
  await f.restart();
  assert.equal(
    (await f.request(u, "/api/session")).data.user.profile.interests[0],
    "바다 산책",
  );
  const replay = await f.send(u, c, "이 취향을 기억해 줘", id);
  assert.equal(replay.data.replayed, true);
  assert.equal(calls, 1);
  assert.equal((await f.send(u, c, "다른 내용", id)).status, 409);
});

test("first AI failure keeps the user message and never fabricates a reply or saves tool drafts; retry is explicit and idempotent", async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    async run({ execute, onDelta }) {
      calls++;
      if (calls === 1) {
        await execute("propose_trip", plan());
        throw new Error("upstream-private-secret");
      }
      onDelta("다시 연결됐어.");
      return { reply: "다시 연결됐어." };
    },
  });
  const u = await f.register();
  await f.request(u, "/api/consent", { accepted: true });
  const c = await f.chat(u),
    sent = await f.send(u, c);
  await f.events(u, sent.data.turnId);
  let state = (await f.request(u, `/api/chats/${c.id}`)).data.chat;
  assert.equal(state.turns[0].status, "failed");
  assert.equal(state.turns[0].message, "바다를 걷고 싶어");
  assert.equal(state.turns[0].reply, "");
  assert.deepEqual(state.turns[0].drafts, []);
  assert.ok(!JSON.stringify(state).includes("secret"));
  const retry = await f.request(u, `/api/turns/${sent.data.turnId}/retry`, {
    attempt: 1,
  });
  await f.events(u, sent.data.turnId);
  assert.equal(retry.status, 202);
  await f.request(u, `/api/turns/${sent.data.turnId}/retry`, { attempt: 1 });
  assert.equal(calls, 2);
  state = (await f.request(u, `/api/chats/${c.id}`)).data.chat;
  assert.equal(state.turns.length, 1);
  assert.equal(state.turns[0].status, "completed");
});

test("consent revocation cancels an in-flight reply and rejects late data and newly generated drafts", async (t) => {
  let started, finish;
  const entered = new Promise((r) => (started = r)),
    gate = new Promise((r) => (finish = r));
  const f = await fixture(t, {
    async run({ execute }) {
      started();
      await gate;
      await execute("propose_trip", plan());
      return { reply: "must not save" };
    },
  });
  const u = await f.register();
  await f.request(u, "/api/consent", { accepted: true });
  const c = await f.chat(u),
    sent = await f.send(u, c);
  await entered;
  await f.request(u, "/api/consent", { accepted: false });
  finish();
  await f.events(u, sent.data.turnId);
  const state = (await f.request(u, `/api/chats/${c.id}`)).data.chat;
  assert.equal(state.turns[0].status, "cancelled");
  assert.deepEqual(state.turns[0].drafts, []);
  assert.equal(state.turns[0].reply, "");
});

test("a stale AI preference proposal cannot overwrite a newer explicitly edited profile", async (t) => {
  const f = await fixture(t, {
    async run({ execute }) {
      await execute("propose_preferences", preference());
      return { reply: "확인해 줘." };
    },
  });
  const u = await f.register();
  await f.request(u, "/api/consent", { accepted: true });
  const c = await f.chat(u),
    sent = await f.send(u, c);
  await f.events(u, sent.data.turnId);
  const draft = (await f.request(u, `/api/chats/${c.id}`)).data.chat.turns[0]
    .drafts[0];
  const account = (await f.request(u, "/api/session")).data.user;
  const edited = { ...account.profile, interests: ["미술관"] };
  assert.equal(
    (
      await f.request(
        u,
        "/api/profile",
        { version: account.profileVersion, profile: edited },
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal(
    (await f.request(u, `/api/drafts/${draft.id}/confirm`, {})).status,
    409,
  );
  assert.deepEqual(
    (await f.request(u, "/api/session")).data.user.profile.interests,
    ["미술관"],
  );
});

test("chat versions serialize submissions and archive/restore retains history", async (t) => {
  const f = await fixture(t),
    u = await f.register();
  await f.request(u, "/api/consent", { accepted: true });
  const c = await f.chat(u),
    r = await f.send(u, c);
  await f.events(u, r.data.turnId);
  assert.equal((await f.send(u, c, "옛 화면에서 보냄")).status, 409);
  await f.request(u, `/api/chats/${c.id}`, { archived: true }, "PATCH");
  assert.equal((await f.request(u, "/api/chats")).data.chats.length, 0);
  assert.equal(
    (await f.request(u, "/api/chats?archived=true")).data.chats.length,
    1,
  );
  await f.request(u, `/api/chats/${c.id}`, { archived: false }, "PATCH");
  assert.equal(
    (await f.request(u, `/api/chats/${c.id}`)).data.chat.turns.length,
    1,
  );
});

test("real OpenAI provider streams text, scopes calls, disables storage, and executes the actual function-call loop", async () => {
  const requests = [],
    executed = [];
  const client = {
    responses: {
      async create(body) {
        requests.push(body);
        return (async function* () {
          if (requests.length === 1) {
            yield {
              type: "response.completed",
              response: {
                status: "completed",
                output: [
                  {
                    type: "function_call",
                    name: "get_saved_trips",
                    call_id: "call1",
                    arguments: "{}",
                  },
                ],
              },
            };
          } else {
            yield {
              type: "response.output_text.delta",
              delta: "저장한 여행을 봤어.",
            };
            yield {
              type: "response.completed",
              response: { status: "completed", output: [] },
            };
          }
        })();
      },
    },
  };
  let text = "";
  const provider = openAIAgent({ client, model: "configured-model" }),
    result = await provider.run({
      messages: [{ role: "user", text: "저장한 여행 보여줘" }],
      onDelta: (x) => (text += x),
      execute: async (name, args) => {
        executed.push([name, args]);
        return [{ title: "내 실제 여행" }];
      },
      signal: new AbortController().signal,
    });
  assert.equal(result.reply, text);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].store, false);
  assert.equal(requests[0].model, "configured-model");
  assert.deepEqual(executed, [["get_saved_trips", {}]]);
  assert.ok(
    requests[1].input.some(
      (x) =>
        x.type === "function_call_output" &&
        x.call_id === "call1" &&
        x.output.includes("내 실제 여행"),
    ),
  );
});

test("plan validation rejects impossible dates, mismatched day order and time, not merely malformed JSON", () => {
  assert.doesNotThrow(() => validate("trip", plan()));
  for (const edit of [
    (p) => (p.startDate = "2026-02-31"),
    (p) => (p.days[0].dayNumber = 2),
    (p) => (p.days[0].stops[0].time = "25:00"),
    (p) => {
      p.startDate = "2026-11-21";
      p.days[0].date = "2026-11-22";
    },
    (p) => {
      p.startDate = "2026-11-21";
      p.endDate = "2026-11-22";
    },
    (p) => {
      p.days[0].date = "2026-11-22";
      p.days.push({
        ...structuredClone(p.days[0]),
        dayNumber: 2,
        date: "2026-11-21",
      });
    },
    (p) => {
      p.startDate = "2026-12-02";
      p.endDate = "2026-12-01";
    },
  ]) {
    const p = plan();
    edit(p);
    assert.throws(() => validate("trip", p));
  }
});

test("browser client retains a lost POST and resubmits the exact ID/body instead of generating a duplicate", async () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) || null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    },
    requests = [];
  let fail = true;
  const client = new ServiceClient({
    storage,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      if (fail) {
        fail = false;
        throw new TypeError("network lost");
      }
      return new Response(
        JSON.stringify({ turnId: "saved", status: "pending" }),
        { status: 202 },
      );
    },
  });
  client.identity({ id: "account-a" }, "csrf");
  const c = { id: randomUUID(), version: 0 };
  await assert.rejects(client.send(c, "그대로 남길 원문"));
  assert.ok(client.pending(c.id));
  client.identity({ id: "account-b" }, "csrf-b");
  assert.equal(client.pending(c.id), null);
  client.identity({ id: "account-a" }, "csrf");
  await client.resolve(c.id);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(client.pending(c.id), null);
});

test("retry obeys the same per-account generation limit as new messages", async (t) => {
  let block = false;
  let release;
  const gate = new Promise((r) => (release = r));
  const f = await fixture(t, {
    async run() {
      if (!block) throw new Error("temporary upstream failure");
      await gate;
      return { reply: "답변 완료" };
    },
  });
  const u = await f.register();
  await f.request(u, "/api/consent", { accepted: true });
  const failedChat = await f.chat(u);
  const failed = await f.send(u, failedChat);
  await f.events(u, failed.data.turnId);
  block = true;
  const a = await f.chat(u),
    b = await f.chat(u),
    c = await f.chat(u);
  await f.send(u, a);
  await f.send(u, b);
  try {
    assert.equal((await f.send(u, c)).status, 429);
    assert.equal(
      (
        await f.request(u, `/api/turns/${failed.data.turnId}/retry`, {
          attempt: 1,
        })
      ).status,
      429,
    );
  } finally {
    release();
  }
});

test("logout immediately revokes generation and a late provider result cannot commit", async (t) => {
  let started, release;
  const entered = new Promise((r) => (started = r)),
    gate = new Promise((r) => (release = r));
  const f = await fixture(t, {
    async run({ onDelta, execute }) {
      onDelta("부분 응답");
      started();
      await gate;
      await execute("propose_preferences", preference());
      return { reply: "중단 이후의 답변" };
    },
  });
  const u = await f.register();
  await f.request(u, "/api/consent", { accepted: true });
  const c = await f.chat(u),
    sent = await f.send(u, c);
  await entered;
  const oldCookie = u.cookie;
  await f.request(u, "/api/auth/logout", {});
  release();
  assert.equal(
    (await f.request({ cookie: oldCookie }, `/api/chats/${c.id}`)).status,
    401,
  );
  await f.request(u, "/api/auth/login", {
    handle: "traveler01",
    password: "A-test-password-2026",
  });
  await f.events(u, sent.data.turnId);
  const state = (await f.request(u, `/api/chats/${c.id}`)).data.chat;
  assert.equal(state.turns[0].status, "cancelled");
  assert.equal(state.turns[0].reply, "부분 응답");
  assert.deepEqual(state.turns[0].drafts, []);
  assert.deepEqual(
    (await f.request(u, "/api/session")).data.user.profile.interests,
    [],
  );
});

test("invalid and unknown model calls cannot execute application tools", async () => {
  let calls = 0,
    executions = 0;
  const client = {
    responses: {
      async create() {
        calls++;
        return (async function* () {
          if (calls === 1)
            yield {
              type: "response.completed",
              response: {
                status: "completed",
                output: [
                  {
                    type: "function_call",
                    name: "read_other_account",
                    arguments: "{}",
                    call_id: "unknown",
                  },
                  {
                    type: "function_call",
                    name: "get_profile",
                    arguments: '{"userId":"someone-else"}',
                    call_id: "forged",
                  },
                  {
                    type: "function_call",
                    name: "propose_trip",
                    arguments: "{bad json",
                    call_id: "invalid",
                  },
                ],
              },
            };
          else {
            yield {
              type: "response.output_text.delta",
              delta: "내 여행만 도울 수 있어.",
            };
            yield {
              type: "response.completed",
              response: { status: "completed", output: [] },
            };
          }
        })();
      },
    },
  };
  const provider = openAIAgent({ client });
  await provider.run({
    messages: [{ role: "user", text: "다른 계정 읽기" }],
    signal: new AbortController().signal,
    onDelta() {},
    execute() {
      executions++;
    },
  });
  assert.equal(executions, 0);
  assert.equal(calls, 2);
});

test("a delayed response from the previous identity is rejected after account switching", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const client = new ServiceClient({
    storage: null,
    fetchImpl: async () => {
      await gate;
      return new Response(
        JSON.stringify({
          user: { id: "previous-account" },
          trips: [{ title: "private trip" }],
        }),
      );
    },
  });
  client.identity({ id: "previous-account" }, "old-csrf");
  const request = client.request("/api/session");
  client.identity({ id: "current-account" }, "new-csrf");
  release();
  await assert.rejects(request, (error) => error.code === "SESSION_CHANGED");
  assert.equal(client.userId, "current-account");
});
