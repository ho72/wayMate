import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { startServer } from "../../server/http/server.mjs";
import { emptySummary } from "../../shared/config/protocol.mjs";
import { assertContract } from "../../server/validation.mjs";
const answers = {
  interests: "cafe",
  activity: "walk_first_photos_occasional",
  conversation: "quiet",
  expression: "가벼운 농담도 조금 ㅎㅎ",
};
async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-test-")),
    file = join(dir, "state.json");
  let app = await startServer({ file, port: 0, ...options });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const id = randomUUID();
  const headers = (actor) => ({
    "X-Demo-Actor": actor,
    "X-Demo-Client-Id": id,
    "Content-Type": "application/json",
  });
  const req = async (path, actor = "web", body, extraHeaders = {}) => {
    const r = await fetch(`http://127.0.0.1:${app.port}${path}`, {
      headers: { ...headers(actor), ...extraHeaders },
      method: body ? "POST" : "GET",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };
  const state = async (actor = "web") =>
    (await req(`/api/state?view=${actor}`, actor)).body;
  const envelope = async (type, payload, actor = "web") => {
    const s = await state(actor);
    return {
      schemaVersion: 3,
      runSeq: s.runSeq,
      runId: s.runId,
      commandId: randomUUID(),
      expectedVersion: s.version,
      actor,
      type,
      target: {},
      payload,
    };
  };
  const send = async (type, payload, actor = "web") =>
    req("/api/commands", actor, await envelope(type, payload, actor));
  const ready = async () => {
    for (const [questionId, answerText] of Object.entries(answers))
      assert.equal(
        (
          await send("ONBOARDING_ANSWER", {
            questionId,
            answerText,
            inputSource: "typed",
          })
        ).status,
        200,
      );
    assert.equal(
      (
        await send("PROFILE_CONFIRM", {
          alias: "구름여행",
          avatarId: "a-02",
          confirmedSummary: {
            ...emptySummary(),
            interests: ["cafe"],
            speakingStyle: "light_humor",
          },
        })
      ).status,
      200,
    );
    const s = await state();
    await send("PROFILE_PRIVATE", {
      profileVersion: s.profileVersion,
      publicationVersion: s.publicationVersion,
    });
    await send("TRIP_SAVE", {
      presetId: "gangneung-01",
      shareSummaryApproved: false,
    });
    assert.equal(
      (await send("HANDOFF_PREPARE", { mode: "prepared_trip" })).status,
      200,
    );
  };
  const car = async () => {
    const session = randomUUID();
    assert.equal(
      (
        await send(
          "CAR_SESSION_OPEN",
          {
            deviceId: randomUUID(),
            vehicleSessionId: session,
            pendingAttempts: [],
          },
          "car",
        )
      ).status,
      200,
    );
    return session;
  };
  const report = (session, seq, overrides = {}) =>
    send(
      "CAR_STATUS",
      {
        vehicleSessionId: session,
        statusSeq: seq,
        restrictionKnown: true,
        restricted: false,
        foreground: true,
        uiContext: "handoff",
        ...overrides,
      },
      "car",
    );
  return {
    req,
    state,
    envelope,
    send,
    ready,
    car,
    report,
    file,
    restart: async () => {
      await app.close();
      app = await startServer({ file, port: 0, ...options });
    },
  };
}
test("real HTTP: web values survive restart, GET is not ACK, fresh vehicle ACK confirms exact snapshot", async (t) => {
  const f = await fixture(t);
  await f.ready();
  const h = (await f.req("/api/handoff", "car")).body;
  assertContract("handoff", h);
  assert.equal(h.owner.alias, "구름여행");
  assert.equal(h.owner.avatarId, "a-02");
  assert.equal(h.owner.speakingStyle, "light_humor");
  assert.deepEqual(h.owner.summary.interests, ["cafe"]);
  assert.equal(h.peer, null);
  assert.equal((await f.state()).handoff.acknowledged, false);
  await f.restart();
  assert.equal(
    (await f.req("/api/handoff", "car")).body.handoffId,
    h.handoffId,
  );
  const session = await f.car();
  await f.report(session, 1);
  const ack = {
    vehicleSessionId: session,
    handoffId: h.handoffId,
    handoffVersion: h.handoffVersion,
    sourceVersions: h.sourceVersions,
    mode: h.mode,
  };
  assert.equal((await f.send("CAR_LOADED", ack, "car")).status, 200);
  assert.equal((await f.state()).handoff.acknowledged, true);
  await f.restart();
  assert.equal((await f.state()).handoff.acknowledged, true);
});
test("duplicate before version check; changed envelope rejected; stale new writes rejected; receipt retained on restart", async (t) => {
  const f = await fixture(t);
  const c = await f.envelope("ONBOARDING_ANSWER", {
    questionId: "interests",
    inputSource: "typed",
    answerText: "cafe",
  });
  const first = await f.req("/api/commands", "web", c);
  assert.equal(first.status, 200);
  await f.send("ONBOARDING_ANSWER", {
    questionId: "interests",
    inputSource: "typed",
    answerText: "relaxed",
  });
  const replay = await f.req("/api/commands", "web", c);
  assert.equal(replay.body.receipt.replayed, true);
  assert.ok(replay.body.state.version > first.body.receipt.committedVersion);
  assert.equal(
    (await f.req("/api/commands", "web", { ...c, expectedVersion: 999 })).body
      .error.code,
    "COMMAND_ID_REUSED",
  );
  assert.equal(
    (await f.req("/api/commands", "web", { ...c, commandId: randomUUID() }))
      .body.error.code,
    "STALE_STATE",
  );
  await f.restart();
  assert.equal(
    (await f.req(`/api/commands/${c.commandId}?runId=${c.runId}`)).body.status,
    "applied",
  );
  assert.equal(
    (await f.req(`/api/commands/${randomUUID()}?runId=${c.runId}`)).body.status,
    "not_found",
  );
});
test("restriction unknown, active, background, expired, old session/sequence block ACK; same heartbeat keeps version", async (t) => {
  let now = 100;
  const f = await fixture(t, { now: () => now });
  await f.ready();
  const h = (await f.req("/api/handoff", "car")).body,
    session = await f.car();
  const payload = {
    vehicleSessionId: session,
    handoffId: h.handoffId,
    handoffVersion: h.handoffVersion,
    sourceVersions: h.sourceVersions,
    mode: "prepared_trip",
  };
  assert.equal((await f.send("CAR_LOADED", payload, "car")).status, 423);
  await f.report(session, 1, { restricted: true });
  assert.equal((await f.send("CAR_LOADED", payload, "car")).status, 423);
  await f.report(session, 2, { foreground: false });
  assert.equal((await f.send("CAR_LOADED", payload, "car")).status, 423);
  await f.report(session, 3);
  const v = (await f.state()).version;
  await f.report(session, 4);
  assert.equal((await f.state()).version, v);
  assert.equal((await f.report(session, 3)).status, 409);
  assert.equal((await f.report(randomUUID(), 5)).status, 409);
  now += 2001;
  assert.equal((await f.send("CAR_LOADED", payload, "car")).status, 423);
  await f.restart();
  assert.equal((await f.state("car")).vehicle.restrictionKnown, false);
});
test("profile change invalidates old handoff, source mismatch rejected, repeated preparation preserves ID", async (t) => {
  const f = await fixture(t);
  await f.ready();
  const h = (await f.req("/api/handoff", "car")).body;
  await f.send("HANDOFF_PREPARE", { mode: "prepared_trip" });
  assert.equal(
    (await f.req("/api/handoff", "car")).body.handoffId,
    h.handoffId,
  );
  await f.send("ONBOARDING_ANSWER", {
    questionId: "interests",
    inputSource: "typed",
    answerText: "sea_walk",
  });
  assert.equal((await f.req("/api/handoff", "car")).status, 409);
  await f.ready();
  const session = await f.car();
  await f.report(session, 1);
  assert.equal(
    (
      await f.send(
        "CAR_LOADED",
        {
          vehicleSessionId: session,
          handoffId: h.handoffId,
          handoffVersion: h.handoffVersion,
          sourceVersions: h.sourceVersions,
          mode: "prepared_trip",
        },
        "car",
      )
    ).body.error.code,
    "STALE_STATE",
  );
});
test("role, view, schema, consent, cross-origin and static boundaries enforced", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.req("/api/state?view=car")).status, 403);
  const c = await f.envelope("ONBOARDING_ANSWER", {
    questionId: "interests",
    inputSource: "typed",
    answerText: "   ",
  });
  assert.equal((await f.req("/api/commands", "web", c)).status, 400);
  assert.equal((await f.req("/api/commands", "car", c)).status, 403);
  assert.equal(
    (
      await f.req("/api/commands", "web", {
        ...c,
        payload: { ...c.payload, extra: true },
      })
    ).status,
    400,
  );
  const originCommand = await f.envelope("ONBOARDING_ANSWER", {
    questionId: "interests",
    inputSource: "typed",
    answerText: "relaxed",
  });
  assert.equal(
    (
      await f.req("/api/commands", "web", originCommand, {
        Origin: "https://example.invalid",
      })
    ).status,
    403,
  );
  await f.ready();
  const other = await f.req("/api/state?view=web", "web", undefined, {
    "X-Demo-Client-Id": randomUUID(),
  });
  assert.equal(other.body.profile, null);
  assert.deepEqual(other.body.allowedActions, []);
  assert.equal(
    (
      await f.req(
        "/api/commands",
        "web",
        await f.envelope("HANDOFF_PREPARE", { mode: "prepared_trip" }),
        { "X-Demo-Client-Id": randomUUID() },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.send("TRIP_SAVE", {
        presetId: "gangneung-01",
        shareSummaryApproved: true,
      })
    ).status,
    400,
  );
  for (const path of [
    "/runtime/state.json",
    "/server/fixtures/trip.mjs",
    "/../package.json",
  ])
    assert.equal((await f.req(path)).status, 404);
  assert.throws(() => assertContract("command", { ...c, schemaVersion: 1 }));
  assertContract("state", await f.state());
});
test("before-rename failure preserves old state; after-rename uncertainty stops writes and recovers receipt", async (t) => {
  let stage = null;
  const f = await fixture(t, {
    fault: (s) => {
      if (s === stage) throw new Error("injected");
    },
  });
  const c = await f.envelope("ONBOARDING_ANSWER", {
    questionId: "interests",
    inputSource: "typed",
    answerText: "relaxed",
  });
  stage = "beforeRename";
  assert.equal((await f.req("/api/commands", "web", c)).status, 500);
  assert.equal((await f.state()).version, 0);
  stage = "afterRename";
  assert.equal((await f.req("/api/commands", "web", c)).status, 503);
  assert.equal((await f.req("/health")).status, 503);
  stage = null;
  await f.restart();
  assert.equal(
    (await f.req(`/api/commands/${c.commandId}?runId=${c.runId}`)).body.status,
    "applied",
  );
});
test("corrupted state is never reset and second writer cannot open the same file", async (t) => {
  const f = await fixture(t);
  await assert.rejects(startServer({ file: f.file, port: 0 }), /EEXIST/);
  const dir = await mkdtemp(join(tmpdir(), "waymate-corrupt-")),
    file = join(dir, "state.json");
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(file, '{"schemaVersion":1}');
  await assert.rejects(startServer({ file, port: 0 }));
  assert.equal(await readFile(file, "utf8"), '{"schemaVersion":1}');
});

test("concurrent writes are serialized: only one stale-version mutation commits; same-ID races replay one receipt", async (t) => {
  const f = await fixture(t);
  const a = await f.envelope("ONBOARDING_ANSWER", {
      questionId: "interests",
      inputSource: "typed",
      answerText: "cafe",
    }),
    b = await f.envelope("ONBOARDING_ANSWER", {
      questionId: "interests",
      inputSource: "typed",
      answerText: "relaxed",
    });
  const results = await Promise.all([
    f.req("/api/commands", "web", a),
    f.req("/api/commands", "web", b),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const c = await f.envelope("ONBOARDING_ANSWER", {
    questionId: "interests",
    inputSource: "typed",
    answerText: "quiet",
  });
  const duplicates = await Promise.all([
    f.req("/api/commands", "web", c),
    f.req("/api/commands", "web", c),
  ]);
  assert.deepEqual(
    duplicates.map((r) => r.status),
    [200, 200],
  );
  assert.equal(
    duplicates[0].body.receipt.committedVersion,
    duplicates[1].body.receipt.committedVersion,
  );
  assert.equal(duplicates.filter((r) => r.body.receipt.replayed).length, 1);
});

test("v3 preserves exact free text and Unicode limits; raw answers never reach car, handoff or foreign web", async (t) => {
  const f = await fixture(t);
  const raw = "  바다🌊\n카페  ㅋㅋ <script>hi</script>  ";
  assert.equal(
    (
      await f.send("ONBOARDING_ANSWER", {
        questionId: "interests",
        answerText: raw,
        inputSource: "typed",
      })
    ).status,
    200,
  );
  assert.equal((await f.state()).onboarding.interests.answerText, raw);
  assert.deepEqual((await f.state("car")).onboarding, {});
  assert.equal(JSON.stringify(await f.state("car")).includes(raw), false);
  const other = await f.req("/api/state?view=web", "web", undefined, {
    "X-Demo-Client-Id": randomUUID(),
  });
  assert.deepEqual(other.body.onboarding, {});
  assert.equal(
    (
      await f.send("ONBOARDING_ANSWER", {
        questionId: "interests",
        answerText: "🌊".repeat(500),
        inputSource: "typed",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.send("ONBOARDING_ANSWER", {
        questionId: "interests",
        answerText: "🌊".repeat(501),
        inputSource: "typed",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.send("ONBOARDING_ANSWER", {
        questionId: "interests",
        answerText: " \n ",
        inputSource: "typed",
      })
    ).status,
    400,
  );
  await f.ready();
  const h = (await f.req("/api/handoff", "car")).body;
  assert.equal("onboarding" in h, false);
  assert.equal("answerText" in h.owner.summary, false);
});

test("prepared follow-up uses exact demo cue; earlier edits invalidate later branch, profile and handoff", async (t) => {
  const f = await fixture(t);
  await f.send("ONBOARDING_ANSWER", {
    questionId: "interests",
    answerText: "맛집 탐방을 좋아해",
    inputSource: "example",
  });
  assert.equal(
    (
      await f.send("ONBOARDING_ANSWER", {
        questionId: "activity",
        answerText: "아직 순서 아님",
        inputSource: "typed",
      })
    ).status,
    409,
  );
  await f.send("ONBOARDING_ANSWER", {
    questionId: "food_detail",
    answerText: "따뜻한 국물 ㅎㅎ",
    inputSource: "typed",
  });
  await f.send("ONBOARDING_ANSWER", {
    questionId: "activity",
    answerText: "천천히",
    inputSource: "typed",
  });
  await f.send("ONBOARDING_ANSWER", {
    questionId: "interests",
    answerText: "바다가 좋아",
    inputSource: "typed",
  });
  const s = await f.state();
  assert.deepEqual(Object.keys(s.onboarding), ["interests"]);
  assert.ok(s.onboarding.interests.revision > 1);
  assert.equal(
    (
      await f.send("ONBOARDING_ANSWER", {
        questionId: "food_detail",
        answerText: "이전 분기",
        inputSource: "typed",
      })
    ).status,
    409,
  );
  await f.ready();
  await f.send("ONBOARDING_ANSWER", {
    questionId: "expression",
    answerText: "새로운 말투",
    inputSource: "typed",
  });
  assert.equal((await f.state()).profile, null);
  assert.equal((await f.req("/api/handoff", "car")).status, 409);
});

test("unconfirmed summary remains empty/null; normalized alias and explicit enums only", async (t) => {
  const f = await fixture(t);
  await f.ready();
  const confirm = await f.send("PROFILE_CONFIRM", {
    alias: "  파도  ",
    avatarId: "a-01",
    confirmedSummary: emptySummary(),
  });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.state.profile.alias, "파도");
  await f.send("HANDOFF_PREPARE", { mode: "prepared_trip" });
  const h = (await f.req("/api/handoff", "car")).body;
  assert.deepEqual(h.owner.summary, emptySummary());
  assert.equal(h.owner.speakingStyle, null);
  assert.equal(
    (
      await f.send("PROFILE_CONFIRM", {
        alias: "파도",
        avatarId: "a-01",
        confirmedSummary: { ...emptySummary(), interests: ["맛집"] },
      })
    ).status,
    400,
  );
});

test("publication changes do not invalidate core snapshot or alter trip share version; private is not a handoff prerequisite", async (t) => {
  const f = await fixture(t);
  await f.ready();
  let s = await f.state();
  const old = s.handoff;
  await f.send("PROFILE_CONFIRM", {
    alias: "파도",
    avatarId: "a-01",
    confirmedSummary: emptySummary(),
  });
  assert.equal(
    (await f.send("HANDOFF_PREPARE", { mode: "prepared_trip" })).status,
    200,
  );
  s = await f.state();
  assert.equal(s.publication, "pending");
  const before = s.handoff,
    tripShare = s.tripShareVersion;
  await f.send("PROFILE_PRIVATE", {
    profileVersion: s.profileVersion,
    publicationVersion: s.publicationVersion,
  });
  s = await f.state();
  assert.deepEqual(s.handoff, before);
  assert.deepEqual(Object.keys(s.handoff.sourceVersions), ["profile", "trip"]);
  assert.equal(s.tripShareVersion, tripShare);
  assert.notEqual(s.handoff.handoffId, old.handoffId);
});

test("stored preparation starts independently of handoff ACK, then web mutations are server blocked", async (t) => {
  const f = await fixture(t);
  await f.ready();
  const session = await f.car();
  await f.report(session, 1);
  const s = await f.state("car"),
    payload = {
      origin: "stored_preparation",
      vehicleSessionId: session,
      sourceVersions: s.preparationPreview.sourceVersions,
    };
  assert.equal(
    (
      await f.send(
        "CAR_START_TRIP",
        { ...payload, sourceVersions: { profile: 999, trip: 1 } },
        "car",
      )
    ).status,
    409,
  );
  const started = await f.send("CAR_START_TRIP", payload, "car");
  assert.equal(started.status, 200);
  assert.equal(
    started.body.state.vehicleActivation.origin,
    "stored_preparation",
  );
  assert.equal(started.body.state.handoff.acknowledged, false);
  assert.ok(started.body.state.activeJourney);
  const web = await f.state();
  assert.deepEqual(web.allowedActions, []);
  for (const [type, payload] of [
    [
      "ONBOARDING_ANSWER",
      { questionId: "interests", answerText: "덮어쓰기", inputSource: "typed" },
    ],
    [
      "PROFILE_CONFIRM",
      { alias: "새별명", avatarId: "a-01", confirmedSummary: emptySummary() },
    ],
    [
      "PROFILE_PRIVATE",
      {
        profileVersion: web.profileVersion,
        publicationVersion: web.publicationVersion,
      },
    ],
    ["TRIP_SAVE", { presetId: "gangneung-01", shareSummaryApproved: false }],
    ["HANDOFF_PREPARE", { mode: "prepared_trip" }],
  ])
    assert.equal((await f.send(type, payload)).status, 409);
});

test("default start requires no preparation, does not fabricate handoff, and only same device restores after fresh restrictions", async (t) => {
  const f = await fixture(t);
  const device = randomUUID(),
    session = randomUUID();
  await f.send(
    "CAR_SESSION_OPEN",
    { deviceId: device, vehicleSessionId: session, pendingAttempts: [] },
    "car",
  );
  await f.report(session, 1);
  const payload = {
    origin: "demo_preset",
    vehicleSessionId: session,
    presetId: "gangneung-01",
  };
  const c = await f.envelope("CAR_START_TRIP", payload, "car");
  assert.equal((await f.req("/api/commands", "car", c)).status, 200);
  assert.equal(
    (await f.req("/api/commands", "car", c)).body.receipt.replayed,
    true,
  );
  let s = await f.state("car");
  assert.equal(s.handoff, null);
  assert.equal(s.activeJourney.owner.alias, "여행자");
  assert.deepEqual(s.activeJourney.owner.summary, emptySummary());
  await f.restart();
  s = await f.state("car");
  assert.equal(s.activeJourney, null);
  assert.equal(s.vehicleActivation.origin, "demo_preset");
  const next = randomUUID();
  assert.equal(
    (
      await f.send(
        "CAR_SESSION_OPEN",
        { deviceId: randomUUID(), vehicleSessionId: next, pendingAttempts: [] },
        "car",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.send(
        "CAR_SESSION_OPEN",
        { deviceId: device, vehicleSessionId: next, pendingAttempts: [] },
        "car",
      )
    ).status,
    200,
  );
  assert.equal((await f.state("car")).activeJourney, null);
  await f.report(next, 1, { restrictionKnown: false });
  assert.equal((await f.state("car")).activeJourney, null);
  await f.report(next, 2);
  s = await f.state("car");
  assert.equal(s.activeJourney.owner.alias, "여행자");
  assert.deepEqual(s.allowedActions, []);
  assert.equal(s.handoff, null);
});

test("default start cannot overwrite even a partial web preparation; v2 requests and files are rejected without rewriting", async (t) => {
  const f = await fixture(t);
  await f.send("ONBOARDING_ANSWER", {
    questionId: "interests",
    answerText: "내 준비",
    inputSource: "typed",
  });
  const session = await f.car();
  await f.report(session, 1);
  assert.equal(
    (
      await f.send(
        "CAR_START_TRIP",
        {
          origin: "demo_preset",
          vehicleSessionId: session,
          presetId: "gangneung-01",
        },
        "car",
      )
    ).status,
    423,
  );
  assert.equal((await f.state()).onboarding.interests.answerText, "내 준비");
  const c = await f.envelope("ONBOARDING_ANSWER", {
    questionId: "interests",
    answerText: "v2 금지",
    inputSource: "typed",
  });
  c.schemaVersion = 2;
  assert.equal((await f.req("/api/commands", "web", c)).status, 400);
  const dir = await mkdtemp(join(tmpdir(), "waymate-v2-preserve-")),
    file = join(dir, "state.json");
  t.after(() => rm(dir, { recursive: true, force: true }));
  const v2 = '{"schemaVersion":2,"answers":{"interests":"cafe"}}';
  await writeFile(file, v2);
  await assert.rejects(startServer({ file, port: 0 }));
  assert.equal(await readFile(file, "utf8"), v2);
});
