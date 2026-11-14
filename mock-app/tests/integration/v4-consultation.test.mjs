import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { startServer } from "../../server/v4/http.mjs";
import { aiFromEnvironment, openAiProvider } from "../../server/ai/openai.mjs";
import { emptySummary } from "../../shared/config/protocol-v4.mjs";

const draft = () => {
  const { summarySource, ...summary } = emptySummary();
  return {
    reply: "바다를 보며 쉬는 시간이 좋구나. 어떤 여행 속도가 편해?",
    introduction: "바다를 보며 쉬는 시간을 좋아해요.",
    summary: { ...summary, interests: ["sea_walk"] },
  };
};
const provider = (generate = async () => draft()) => ({
  name: "test",
  generate,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

async function fixture(t, aiProvider = provider(), extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-ai-")),
    file = join(dir, "state.json");
  let app = await startServer({ file, port: 0, aiProvider, ...extra });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const id = randomUUID();
  async function request(path, body, actor = "web", client = id, headers = {}) {
    const response = await fetch(`http://127.0.0.1:${app.port}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "X-Demo-Actor": actor,
        "X-Demo-Client-Id": client,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(3000),
    });
    return { status: response.status, body: await response.json() };
  }
  const state = async (actor = "web", client = id) =>
    (await request(`/api/state?view=${actor}`, null, actor, client)).body;
  const turn = async (message = "바다를 보며 쉬는 여행이 좋아요") => {
    const s = await state();
    return {
      runId: s.runId,
      requestId: randomUUID(),
      expectedRevision: s.consultation?.revision || 0,
      message,
      consent: true,
    };
  };
  const command = async (
    type,
    payload,
    actor = "web",
    target = {},
    client = id,
  ) => {
    const s = await state(actor, client);
    return request(
      "/api/commands",
      {
        schemaVersion: 4,
        runId: s.runId,
        runSeq: s.runSeq,
        expectedVersion: s.version,
        commandId: randomUUID(),
        actor,
        type,
        target,
        payload,
      },
      actor,
      client,
    );
  };
  return {
    request,
    state,
    turn,
    command,
    file,
    id,
    close: () => app.close(),
    restart: async () => {
      await app.close();
      app = await startServer({ file, port: 0, aiProvider, ...extra });
    },
  };
}

test("OpenAI provider uses bounded structured Responses, store=false, only owner turns, and keeps credentials server side", async () => {
  let sent;
  const ai = openAiProvider({
    apiKey: "test-private-key",
    model: "configured-model",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer test-private-key");
      sent = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: JSON.stringify(draft()) }],
            },
          ],
        }),
      );
    },
  });
  const result = await ai.generate({
    turns: [
      {
        message: "앞선 원문",
        result: { ...draft(), introduction: "never send draft" },
      },
    ],
    message: "다음 원문",
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, draft());
  assert.equal(sent.store, false);
  assert.equal(sent.model, "configured-model");
  assert.equal(sent.text.format.strict, true);
  assert.equal(sent.text.format.type, "json_schema");
  assert.equal(sent.max_output_tokens, 1500);
  assert.equal(sent.tools, undefined);
  const properties = sent.text.format.schema.properties.summary.properties;
  assert.equal(properties.activityPreference.anyOf[0].type, "string");
  assert.deepEqual(properties.activityPreference.anyOf[0].enum, [
    "walk_first_photos_occasional",
  ]);
  assert.equal(properties.interests.items.type, "string");
  assert.equal(properties.interests.uniqueItems, undefined);
  assert.deepEqual(
    sent.input.map((x) => x.content),
    ["앞선 원문", draft().reply, "다음 원문"],
  );
  assert.ok(!JSON.stringify(sent).includes("test-private-key"));
  assert.equal(aiFromEnvironment({}), null);
  assert.throws(
    () => aiFromEnvironment({ WAYMATE_AI_PROVIDER: "openai" }),
    /OPENAI_API_KEY/,
  );
});

test("provider rejects refusal, incomplete, malformed, duplicate-enum and upstream errors without leaking upstream secrets", async (t) => {
  const cases = [
    {
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "refusal", refusal: "sensitive upstream" }],
        },
      ],
    },
    { status: "incomplete", output: [] },
    {
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "not json" }],
        },
      ],
    },
    {
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                ...draft(),
                summary: { ...draft().summary, interests: ["cafe", "cafe"] },
              }),
            },
          ],
        },
      ],
    },
  ];
  for (const [i, value] of cases.entries())
    await t.test(`invalid response ${i}`, async () => {
      const ai = openAiProvider({
        apiKey: "secret",
        model: "model",
        fetchImpl: async () => new Response(JSON.stringify(value)),
      });
      await assert.rejects(
        ai.generate({
          turns: [],
          message: "안녕",
          signal: new AbortController().signal,
        }),
        (e) => !!e.status && !e.message.includes("sensitive upstream"),
      );
    });
  const ai = openAiProvider({
    apiKey: "secret",
    model: "model",
    fetchImpl: async () => new Response("secret debug body", { status: 401 }),
  });
  await assert.rejects(
    ai.generate({
      turns: [],
      message: "안녕",
      signal: new AbortController().signal,
    }),
    (e) => !e.message.includes("secret"),
  );
});

test("disabled AI reports unavailable, never saves a fake reply, and leaves normal demo onboarding available", async (t) => {
  const f = await fixture(t, null),
    r = await f.request("/api/consultation/turns", await f.turn());
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, "AI_NOT_CONFIGURED");
  const s = await f.state();
  assert.equal(s.consultation, undefined);
  assert.equal(s.clientId, null);
  assert.ok(s.allowedActions.includes("ONBOARDING_ANSWER"));
  assert.equal(
    (await f.request("/api/scenario")).body.capabilities.aiConsultation,
    false,
  );
});

test("AI conversation survives restart, replay does not regenerate, and private raw/draft never reach car, operator or another browser", async (t) => {
  let calls = 0;
  const f = await fixture(
    t,
    provider(async () => {
      calls++;
      return draft();
    }),
  );
  const req = await f.turn("나만의 상담 원문"),
    a = await f.request("/api/consultation/turns", req);
  assert.equal(a.status, 200);
  assert.equal(a.body.state.consultation.revision, 1);
  assert.equal(a.body.state.profile, null);
  assert.equal(a.body.state.publication, "pending");
  assert.deepEqual(a.body.state.onboarding, {});
  for (const [actor, id] of [
    ["car", f.id],
    ["operator", f.id],
    ["web", randomUUID()],
  ]) {
    const projection = await f.state(actor, id);
    assert.equal(projection.consultation, null);
    assert.ok(!JSON.stringify(projection).includes("나만의 상담 원문"));
    assert.ok(!JSON.stringify(projection).includes(draft().introduction));
  }
  await f.restart();
  const replay = await f.request("/api/consultation/turns", req);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(calls, 1);
  const reused = await f.request("/api/consultation/turns", {
    ...req,
    message: "바꾼 원문",
  });
  assert.equal(reused.status, 400);
  assert.equal(calls, 1);
  const foreign = await f.request(
    "/api/consultation/turns",
    req,
    "web",
    randomUUID(),
  );
  assert.equal(foreign.status, 403);
  assert.equal(calls, 1);
});

test("AI intro requires explicit latest-revision confirmation; only confirmed enum summary crosses the vehicle handoff", async (t) => {
  const f = await fixture(t);
  await f.request("/api/consultation/turns", await f.turn());
  await f.request(
    "/api/consultation/turns",
    await f.turn("조용히 걷는 것도 좋아요"),
  );
  const payload = {
    alias: "파도",
    avatarId: "a-01",
    introduction: "내가 고친 자유 소개",
    consultationRevision: 1,
    confirmedSummary: {
      ...draft().summary,
      interests: [],
      summarySource: "user_confirmed_ai",
    },
  };
  assert.equal((await f.command("PROFILE_CONFIRM", payload)).status, 409);
  const confirmed = await f.command("PROFILE_CONFIRM", {
    ...payload,
    consultationRevision: 2,
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.state.profile.introduction, payload.introduction);
  assert.deepEqual(confirmed.body.state.profile.privateSummary.interests, []);
  assert.equal(confirmed.body.state.publication, "pending");
  assert.equal(
    (await f.request("/api/consultation/turns", await f.turn())).status,
    409,
  );
  assert.equal(
    (
      await f.command("TRIP_SAVE", {
        presetId: "gangneung-01",
        shareSummaryApproved: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.command("HANDOFF_PREPARE", { mode: "my_trip" })).status,
    200,
  );
  const handoff = (await f.request("/api/handoff", null, "car")).body;
  assert.equal(handoff.owner.summary.summarySource, "user_confirmed_ai");
  assert.ok(!JSON.stringify(handoff).includes(payload.introduction));
  assert.ok(!JSON.stringify(handoff).includes(draft().reply));
  for (const actor of ["car", "operator"])
    assert.equal((await f.state(actor)).profile, null);
  const beforeReset = await f.state();
  assert.equal(
    (
      await f.command("RESET_BEGIN", {}, "operator", {
        runId: beforeReset.runId,
      })
    ).status,
    200,
  );
  const resetAck = (await f.state()).actionBindings.RESET_ACK;
  assert.equal(
    (
      await f.command(
        resetAck.commandType,
        resetAck.payload,
        "web",
        resetAck.target,
      )
    ).status,
    200,
  );
  assert.ok(!(await readFile(f.file, "utf8")).includes(payload.introduction));
});

test("AI cannot bypass missing conversation, consent, role/origin checks or an existing demo answer", async (t) => {
  let calls = 0;
  const f = await fixture(
      t,
      provider(async () => {
        calls++;
        return draft();
      }),
    ),
    req = await f.turn();
  for (const actor of ["car", "operator"])
    assert.equal(
      (await f.request("/api/consultation/turns", req, actor)).status,
      403,
    );
  assert.equal(
    (
      await f.request("/api/consultation/turns", req, "web", f.id, {
        Origin: "https://foreign.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.request("/api/consultation/turns", { ...req, consent: false }))
      .status,
    400,
  );
  assert.equal(
    (await f.request("/api/consultation/turns", { ...req, message: " " }))
      .status,
    400,
  );
  assert.equal(
    (
      await f.request("/api/consultation/turns", {
        ...req,
        message: "가".repeat(501),
      })
    ).status,
    400,
  );
  assert.equal(calls, 0);
  await f.command("ONBOARDING_ANSWER", {
    questionId: "interests",
    answerText: "기존 시연 답변",
    inputSource: "typed",
  });
  assert.equal((await f.request("/api/consultation/turns", req)).status, 409);
  assert.equal(calls, 0);
});

test("slow AI does not block vehicle/status reads; duplicate requests coalesce and different concurrent messages are refused", async (t) => {
  const entered = deferred(),
    finish = deferred();
  let calls = 0;
  const f = await fixture(
    t,
    provider(async () => {
      calls++;
      entered.resolve();
      await finish.promise;
      return draft();
    }),
  );
  const req = await f.turn(),
    first = f.request("/api/consultation/turns", req);
  await entered.promise;
  const duplicate = f.request("/api/consultation/turns", req);
  assert.equal((await f.state("car")).schemaVersion, 4);
  const session = randomUUID();
  assert.equal(
    (
      await f.command(
        "CAR_SESSION_OPEN",
        {
          deviceId: randomUUID(),
          vehicleSessionId: session,
          pendingAttempts: [],
          navigationSource: "mock",
        },
        "car",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.command(
        "CAR_STATUS",
        {
          vehicleSessionId: session,
          statusSeq: 1,
          restrictionKnown: true,
          restricted: false,
          foreground: true,
          uiContext: "handoff",
        },
        "car",
      )
    ).status,
    200,
  );
  assert.ok((await f.state("car")).allowedActions.includes("CAR_START_TRIP"));
  assert.equal(
    (
      await f.request("/api/consultation/turns", {
        ...req,
        requestId: randomUUID(),
      })
    ).status,
    409,
  );
  finish.resolve();
  assert.equal((await first).status, 200);
  assert.equal((await duplicate).status, 200);
  assert.equal(calls, 1);
  assert.equal((await f.state()).consultation.turns.length, 1);
});

test("reset during AI generation rejects late completion and removes private conversation without archiving it", async (t) => {
  const entered = deferred(),
    finish = deferred();
  const f = await fixture(
    t,
    provider(async ({ turns }) => {
      if (turns.length) {
        entered.resolve();
        await finish.promise;
      }
      return draft();
    }),
  );
  await f.request("/api/consultation/turns", await f.turn("사라질 상담 원문"));
  const old = await f.state(),
    pending = f.request(
      "/api/consultation/turns",
      await f.turn("늦게 올 원문"),
    );
  await entered.promise;
  const reset = await f.command("RESET_BEGIN", {}, "operator", {
    runId: old.runId,
  });
  finish.resolve();
  assert.equal(reset.status, 200);
  assert.equal((await pending).status, 423);
  const locked = await f.state();
  assert.equal(locked.consultation, null);
  const ack = locked.actionBindings.RESET_ACK;
  assert.ok(ack);
  assert.equal(
    (await f.command(ack.commandType, ack.payload, "web", ack.target)).status,
    200,
  );
  const next = await f.state();
  assert.notEqual(next.runId, old.runId);
  assert.equal(next.consultation, undefined);
  assert.ok(!(await readFile(f.file, "utf8")).includes("사라질 상담 원문"));
  assert.equal(
    (
      await f.request("/api/consultation/turns", {
        runId: old.runId,
        requestId: randomUUID(),
        expectedRevision: 0,
        message: "이전 회차",
        consent: true,
      })
    ).status,
    409,
  );
});

test("timeouts and provider failures preserve the saved conversation and return an error rather than a prepared answer", async (t) => {
  const f = await fixture(
    t,
    openAiProvider({
      apiKey: "not-a-real-key",
      model: "model",
      fetchImpl: async (_url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    }),
    { aiTimeoutMs: 20 },
  );
  const result = await f.request("/api/consultation/turns", await f.turn());
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, "AI_TIMEOUT");
  const after = await f.state();
  assert.equal(after.consultation, undefined);
  assert.equal(after.clientId, null);
  assert.ok(after.allowedActions.includes("ONBOARDING_ANSWER"));
});

test("twenty-turn bound refuses a new provider call while saved replies remain recoverable", async (t) => {
  let calls = 0;
  const f = await fixture(
    t,
    provider(async () => {
      calls++;
      return draft();
    }),
  );
  let last;
  for (let i = 0; i < 20; i++) {
    last = await f.turn(`이야기 ${i}`);
    assert.equal(
      (await f.request("/api/consultation/turns", last)).status,
      200,
    );
  }
  assert.equal(
    (await f.request("/api/consultation/turns", await f.turn())).status,
    409,
  );
  assert.equal(
    (await f.request("/api/consultation/turns", last)).body.replayed,
    true,
  );
  assert.equal(calls, 20);
});

test("shutdown aborts an in-flight provider call and releases the store without a fabricated reply", async (t) => {
  const entered = deferred();
  const ai = openAiProvider({
    apiKey: "test-key",
    model: "model",
    fetchImpl: async (_url, { signal }) => {
      entered.resolve();
      return new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    },
  });
  const f = await fixture(t, ai);
  const request = f
    .request("/api/consultation/turns", await f.turn())
    .catch(() => null);
  await entered.promise;
  await f.close();
  await request;
  const saved = JSON.parse(await readFile(f.file));
  assert.equal(saved.consultation, undefined);
  assert.equal(saved.clientId, null);
  await assert.rejects(readFile(f.file + ".lock"), (e) => e.code === "ENOENT");
});

test("first provider failure leaves the demo usable without resetting; a later successful retry commits owner and first turn together", async (t) => {
  let failing = true;
  const f = await fixture(
    t,
    provider(async () => {
      if (failing)
        throw Object.assign(new Error("provider unavailable"), {
          status: 503,
          code: "AI_UNAVAILABLE",
        });
      return draft();
    }),
  );
  const req = await f.turn(),
    before = await f.state();
  assert.equal((await f.request("/api/consultation/turns", req)).status, 503);
  await f.restart();
  const after = await f.state();
  assert.equal(after.runId, before.runId);
  assert.equal(after.version, before.version);
  assert.equal(after.clientId, null);
  assert.equal(after.consultation, undefined);
  assert.ok(after.allowedActions.includes("ONBOARDING_ANSWER"));
  failing = false;
  assert.equal((await f.request("/api/consultation/turns", req)).status, 200);
  const saved = JSON.parse(await readFile(f.file));
  assert.equal(saved.clientId, f.id);
  assert.equal(saved.consultation.revision, 1);
  assert.equal(saved.consultation.turns[0].requestId, req.requestId);
});

test("first unavailable/refused/invalid response permits an actual demo answer without O01", async (t) => {
  for (const [status, code] of [
    [503, "AI_UNAVAILABLE"],
    [422, "AI_REFUSED"],
    [503, "AI_INVALID_RESPONSE"],
  ]) {
    await t.test(code, async (t) => {
      const f = await fixture(
        t,
        provider(async () => {
          throw Object.assign(new Error("test failure"), { status, code });
        }),
      );
      const req = await f.turn();
      assert.equal(
        (await f.request("/api/consultation/turns", req)).status,
        status,
      );
      assert.equal((await f.state()).consultation, undefined);
      const answer = await f.command("ONBOARDING_ANSWER", {
        questionId: "interests",
        answerText: "시연으로 이어갈 원문",
        inputSource: "typed",
      });
      assert.equal(answer.status, 200);
      assert.equal(
        answer.body.state.onboarding.interests.answerText,
        "시연으로 이어갈 원문",
      );
      assert.equal(answer.body.state.consultation, undefined);
    });
  }
});

test("late first AI response cannot overwrite a demo answer chosen by the same or another browser", async (t) => {
  for (const otherOwner of [false, true])
    await t.test(`other browser=${otherOwner}`, async (t) => {
      const entered = deferred(),
        finish = deferred();
      const f = await fixture(
        t,
        provider(async () => {
          entered.resolve();
          await finish.promise;
          return draft();
        }),
      );
      const req = await f.turn(),
        waiting = f.request("/api/consultation/turns", req);
      await entered.promise;
      const preflight = JSON.parse(await readFile(f.file));
      assert.equal(preflight.clientId, null);
      assert.equal(preflight.consultation, undefined);
      const id = otherOwner ? randomUUID() : f.id;
      const answer = await f.command(
        "ONBOARDING_ANSWER",
        {
          questionId: "interests",
          answerText: "먼저 저장한 시연 답변",
          inputSource: "typed",
        },
        "web",
        {},
        id,
      );
      finish.resolve();
      assert.equal(answer.status, 200);
      assert.equal((await waiting).status, otherOwner ? 403 : 409);
      const after = await f.state("web", id);
      assert.equal(after.consultation, undefined);
      assert.equal(
        after.onboarding.interests.answerText,
        "먼저 저장한 시연 답변",
      );
    });
});

test("first AI failure or a pending first response never prevents a parked vehicle from explicitly starting its demo trip", async (t) => {
  for (const pending of [false, true])
    await t.test(`pending=${pending}`, async (t) => {
      const entered = deferred(),
        finish = deferred();
      const f = await fixture(
        t,
        provider(async () => {
          if (!pending)
            throw Object.assign(new Error("test unavailable"), {
              status: 503,
              code: "AI_UNAVAILABLE",
            });
          entered.resolve();
          await finish.promise;
          return draft();
        }),
      );
      const req = await f.turn(),
        waiting = f.request("/api/consultation/turns", req);
      if (pending) await entered.promise;
      else assert.equal((await waiting).status, 503);
      const session = randomUUID();
      await f.command(
        "CAR_SESSION_OPEN",
        {
          deviceId: randomUUID(),
          vehicleSessionId: session,
          pendingAttempts: [],
          navigationSource: "mock",
        },
        "car",
      );
      await f.command(
        "CAR_STATUS",
        {
          vehicleSessionId: session,
          statusSeq: 1,
          restrictionKnown: true,
          restricted: false,
          foreground: true,
          uiContext: "handoff",
        },
        "car",
      );
      const binding = (await f.state("car")).actionBindings.CAR_START_TRIP;
      assert.ok(binding);
      const started = await f.command(
        binding.commandType,
        binding.payload,
        "car",
        binding.target,
      );
      finish.resolve();
      assert.equal(started.status, 200);
      if (pending) assert.equal((await waiting).status, 409);
      const after = await f.state("car");
      assert.equal(after.vehicleActivation.origin, "demo_preset");
      assert.equal(after.consultation, undefined);
    });
});

test("startup removes legacy empty AI reservations but preserves their owner and restores demo actions", async (t) => {
  const f = await fixture(t);
  await f.close();
  const legacy = JSON.parse(await readFile(f.file));
  legacy.clientId = f.id;
  legacy.consultation = { revision: 0, turns: [] };
  await writeFile(f.file, JSON.stringify(legacy));
  await f.restart();
  const after = await f.state();
  assert.equal(after.clientId, f.id);
  assert.equal(after.runId, legacy.runId);
  assert.equal(after.consultation, undefined);
  assert.ok(after.allowedActions.includes("ONBOARDING_ANSWER"));
  assert.equal(JSON.parse(await readFile(f.file)).consultation, undefined);
});
