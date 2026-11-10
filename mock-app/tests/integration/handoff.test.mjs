import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { startServer } from "../../server/http/server.mjs";
import { summaryFromAnswers } from "../../shared/config/protocol.mjs";
import { assertContract } from "../../server/validation.mjs";
const answers = {
  interests: "cafe",
  activity: "walk_first_photos_occasional",
  pace: "relaxed",
  conversation: "quiet",
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
      schemaVersion: 2,
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
    for (const [questionId, answerPresetId] of Object.entries(answers))
      assert.equal(
        (await send("ONBOARDING_ANSWER", { questionId, answerPresetId }))
          .status,
        200,
      );
    assert.equal(
      (
        await send("PROFILE_CONFIRM", {
          alias: "구름여행",
          avatarId: "a-02",
          speakingStyle: "light_humor",
          summary: summaryFromAnswers(answers),
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
      (await send("HANDOFF_PREPARE", { mode: "my_trip" })).status,
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
    answerPresetId: "cafe",
  });
  const first = await f.req("/api/commands", "web", c);
  assert.equal(first.status, 200);
  await f.send("ONBOARDING_ANSWER", {
    questionId: "pace",
    answerPresetId: "relaxed",
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
    mode: "my_trip",
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
  await f.send("HANDOFF_PREPARE", { mode: "my_trip" });
  assert.equal(
    (await f.req("/api/handoff", "car")).body.handoffId,
    h.handoffId,
  );
  await f.send("ONBOARDING_ANSWER", {
    questionId: "interests",
    answerPresetId: "sea_walk",
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
          mode: "my_trip",
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
    questionId: "pace",
    answerPresetId: "cafe",
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
    questionId: "pace",
    answerPresetId: "relaxed",
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
        await f.envelope("HANDOFF_PREPARE", { mode: "my_trip" }),
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
    questionId: "pace",
    answerPresetId: "relaxed",
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
      answerPresetId: "cafe",
    }),
    b = await f.envelope("ONBOARDING_ANSWER", {
      questionId: "pace",
      answerPresetId: "relaxed",
    });
  const results = await Promise.all([
    f.req("/api/commands", "web", a),
    f.req("/api/commands", "web", b),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const c = await f.envelope("ONBOARDING_ANSWER", {
    questionId: "conversation",
    answerPresetId: "quiet",
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
