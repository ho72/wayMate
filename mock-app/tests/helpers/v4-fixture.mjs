import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { coordinator } from "../../server/v4/commands.mjs";
import { initialState, validateStore } from "../../server/v4/state.mjs";
import { emptySummary } from "../../shared/config/protocol.mjs";
export async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-v4-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "state.json");
  let clock = 10000,
    app = coordinator(file, initialState(), { now: () => clock });
  const id = randomUUID(),
    session = randomUUID(),
    device = randomUUID(),
    sdk = randomUUID();
  let seq = 0,
    q = 0;
  const read = (a = "web", client = id) =>
    app.read(a, a === "web" ? client : null);
  const envelope = async (type, payload = {}, actor = "web", target = {}) => {
    const s = await read(actor);
    return {
      schemaVersion: 4,
      runSeq: s.runSeq,
      runId: s.runId,
      commandId: randomUUID(),
      expectedVersion: s.version,
      actor,
      type,
      target,
      payload,
    };
  };
  const post = (c) => app.command(c, c.actor, c.actor === "web" ? id : null);
  const send = async (type, payload = {}, actor = "web", target = {}) =>
    post(await envelope(type, payload, actor, target));
  const act = async (name, a = "web") => {
    const b = (await read(a)).actionBindings[name];
    assert.ok(b, `binding ${name}`);
    return send(b.commandType, b.payload, a, b.target);
  };
  const prepare = async () => {
    for (const questionId of [
      "interests",
      "activity",
      "conversation",
      "expression",
    ])
      await send("ONBOARDING_ANSWER", {
        questionId,
        answerText: "원문 그대로 ㅋㅋ",
        inputSource: "typed",
      });
    await send("PROFILE_CONFIRM", {
      alias: "파도",
      avatarId: "a-01",
      confirmedSummary: emptySummary(),
    });
    await send("TRIP_SAVE", {
      presetId: "gangneung-01",
      shareSummaryApproved: false,
    });
  };
  const publish = async () => {
    await act("PROFILE_PUBLISH");
    await act("TRIP_SHARE_CONFIRM");
  };
  const respond = async (kind, decision) => {
    const pending = (await read("operator")).social.pendingResponses.find(
      (r) => r.kind === kind,
    );
    assert.ok(pending);
    return send("B_RESPONSE", { decision }, "operator", pending);
  };
  const connect = async () => {
    await prepare();
    await publish();
    await act("CONNECT_REQUEST");
    await respond("connection", "accept");
    await act("CONFIRM_WINDOW");
  };
  const status = () =>
    send(
      "CAR_STATUS",
      {
        vehicleSessionId: session,
        statusSeq: ++seq,
        restrictionKnown: true,
        restricted: false,
        foreground: true,
        uiContext: "navigation",
      },
      "car",
    );
  const activate = async (mode = "connected") => {
    await send("HANDOFF_PREPARE", { mode });
    await send(
      "CAR_SESSION_OPEN",
      {
        deviceId: device,
        vehicleSessionId: session,
        pendingAttempts: [],
        navigationSource: "real",
      },
      "car",
    );
    await status();
    return act("CAR_LOADED", "car");
  };
  const meeting = async () => {
    await act("MEETING_PROPOSE", "car");
    await respond("meeting", "accept");
  };
  const common = async () => ({
    vehicleSessionId: session,
    vehicleEpoch: (await read("car")).vehicle.vehicleEpoch,
  });
  const d = {
      latitude: 37.48544722,
      longitude: 127.03636666,
      name: "42dot",
      poiId: "",
    },
    m = {
      latitude: 0,
      longitude: 0,
      name: "소프트웨어드림센터",
      poiId: "36khp2hdj2cfcm5nqhe3",
    };
  const evidence = (w = [], after = 0) => {
    const snap = (at) => ({
      sessionId: sdk,
      querySeq: ++q,
      startedAt: at,
      completedAt: at + 100,
      destination: d,
      waypoints: w,
      naviMode: "ROUTE_GUIDING",
      isRouting: false,
    });
    return {
      first: snap(after + 1),
      second: snap(after + 1201),
      lookup: {
        sessionId: sdk,
        receivedAt: 0,
        poiId: m.poiId,
        point: { ...m, latitude: 37.4127749, longitude: 127.0947566 },
      },
    };
  };
  const navApprove = async (op = "add", e = evidence()) => {
    await send(
      "NAV_OBSERVE",
      { ...(await common()), source: "real", evidence: e },
      "car",
    );
    const s = await read("car"),
      target = { proposalId: s.social.meeting.proposalId };
    if (op === "remove") target.reason = "meeting_cancel";
    return send(
      op === "add" ? "NAV_APPROVE" : "NAV_REMOVE_APPROVE",
      {
        ...(await common()),
        operation: op,
        reviewed: e,
        ownedAttemptId: op === "remove" ? s.navigation.owned.attemptId : null,
      },
      "car",
      target,
    );
  };
  const dispatch = async (a) =>
    send(
      "NAV_DISPATCH_BEGIN",
      {
        ...(await common()),
        attemptId: a.attemptId,
        executionRecordId: randomUUID(),
        dispatchAt: a.before.second.completedAt + 1,
      },
      "car",
    );
  const report = async (a, outcome, e) =>
    send(
      "NAV_REPORT",
      {
        ...(await common()),
        attemptId: a.attemptId,
        executionRecordId: a.executionRecordId,
        reportId: randomUUID(),
        outcome,
        evidence: e,
      },
      "car",
    );
  return {
    read,
    receipt: (actor, runId, commandId) =>
      app.receipt(actor, actor === "web" ? id : null, runId, commandId),
    envelope,
    post,
    send,
    act,
    prepare,
    publish,
    connect,
    respond,
    activate,
    status,
    meeting,
    common,
    evidence,
    navApprove,
    dispatch,
    report,
    m,
    file,
    id,
    device,
    session,
    expire: () => (clock += 2100),
    restart: async () => {
      app = coordinator(file, JSON.parse(await readFile(file)), {
        now: () => clock,
      });
      await read("car");
      await status();
    },
  };
}
