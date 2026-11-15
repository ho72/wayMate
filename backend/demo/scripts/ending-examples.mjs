import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { coordinator } from "../server/v4/commands.mjs";

// Separate coordinator branch with simulated adapter facts; never an SDK execution artifact.
export async function endingExamples(directory, fixtures) {
  const seed = JSON.parse(
    await readFile(join(directory, "state.json"), "utf8"),
  );
  const api = coordinator(join(directory, "ending.json"), seed, {
    now: () => 10000,
  });
  async function send(type, payload, actor, label, target = {}) {
    const s = await api.read(actor, actor === "web" ? seed.clientId : null),
      c = {
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
    fixtures.push({
      file: `command-${label}.json`,
      definition: "command",
      value: c,
    });
    return api.command(c, actor, actor === "web" ? seed.clientId : null);
  }
  async function act(key, actor, label) {
    const b = (await api.read(actor, null)).actionBindings[key];
    return send(b.commandType, b.payload, actor, label, b.target);
  }
  async function save(label, actor = "car") {
    fixtures.push({
      file: `state-${label}.json`,
      definition: "state",
      value: await api.read(actor, null),
    });
  }
  const session = randomUUID(),
    sdk = randomUUID();
  await send(
    "CAR_SESSION_OPEN",
    {
      deviceId: seed.vehicle.deviceId,
      vehicleSessionId: session,
      pendingAttempts: [],
      navigationSource: "real",
    },
    "car",
    "ending-car-session",
  );
  await send(
    "CAR_STATUS",
    {
      vehicleSessionId: session,
      statusSeq: 1,
      restrictionKnown: true,
      restricted: false,
      foreground: true,
      uiContext: "navigation",
    },
    "car",
    "ending-status",
  );
  const epoch = (await api.read("car", null)).vehicle.vehicleEpoch,
    common = { vehicleSessionId: session, vehicleEpoch: epoch },
    d = {
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
  let seq = 0;
  function evidence(waypoints, base) {
    const snap = (at) => ({
      sessionId: sdk,
      querySeq: ++seq,
      startedAt: at,
      completedAt: at + 100,
      destination: d,
      waypoints,
      naviMode: "ROUTE_GUIDING",
      isRouting: false,
    });
    return {
      first: snap(base + 1),
      second: snap(base + 1201),
      lookup: {
        sessionId: sdk,
        receivedAt: 0,
        poiId: m.poiId,
        point: { ...m, latitude: 37.4127749, longitude: 127.0947566 },
      },
    };
  }
  let e = evidence([], 0);
  await send(
    "NAV_OBSERVE",
    { ...common, source: "real", evidence: e },
    "car",
    "ending-nav-before",
  );
  await send(
    "NAV_APPROVE",
    { ...common, operation: "add", reviewed: e, ownedAttemptId: null },
    "car",
    "ending-nav-approve",
    { proposalId: seed.social.meeting.proposalId },
  );
  let a = (await api.read("car", null)).navigation.attempts.at(-1);
  await send(
    "NAV_DISPATCH_BEGIN",
    {
      ...common,
      attemptId: a.attemptId,
      executionRecordId: randomUUID(),
      dispatchAt: a.before.second.completedAt + 1,
    },
    "car",
    "ending-nav-dispatch",
  );
  a = (await api.read("car", null)).navigation.attempts.at(-1);
  e = evidence([m], a.dispatchAt);
  await send(
    "NAV_REPORT",
    {
      ...common,
      attemptId: a.attemptId,
      executionRecordId: a.executionRecordId,
      reportId: randomUUID(),
      outcome: "applied",
      evidence: e,
    },
    "car",
    "ending-nav-applied",
  );
  await send(
    "NAV_OBSERVE",
    { ...common, source: "real", evidence: e },
    "car",
    "ending-nav-observed",
  );
  await act("MEETING_START", "operator", "meeting-start");
  await save("car-meeting-reenactment");
  await act("MEETING_END", "operator", "meeting-end");
  await save("car-final-open");
  await save("operator-final-open", "operator");
  await act("B_FINAL_MY_AGENT", "operator", "final-b-first");
  await save("car-final-b-first-hidden");
  await act("FINAL_CHOOSE_TOGETHER", "car", "final-a-submit");
  await save("car-own-ending");
  await act("REPLAY_FINAL", "operator", "replay-final");
  await save("car-final-replay");
  await act("FINAL_CHOOSE_TOGETHER", "car", "replay-a-submit");
  await act("B_FINAL_TOGETHER", "operator", "replay-b-submit");
  await save("car-together-ending");
}
