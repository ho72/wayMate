import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { coordinator } from "../../server/commands.mjs";
import { initialState } from "../../server/state.mjs";
import { place } from "../../server/domain/navigation.mjs";
const d = {
  latitude: 37.48544722,
  longitude: 127.03636666,
  name: "42dot",
  poiId: "",
};
const m = { latitude: 0, longitude: 0, name: place.name, poiId: place.poiId };
async function fixture(t, source = "real") {
  const dir = await mkdtemp(join(tmpdir(), "waymate-nav-")),
    file = join(dir, "state.json");
  t.after(() => rm(dir, { recursive: true, force: true }));
  let clock = 10000,
    app = coordinator(file, initialState(), { now: () => clock }),
    session = randomUUID(),
    device = randomUUID(),
    sdk = randomUUID(),
    query = 0;
  const read = () => app.read("car", null);
  const envelope = async (type, payload, actor = "car") => {
    const s = await read();
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
  const post = (c) => app.command(c, c.actor, null);
  const send = async (t, p) => post(await envelope(t, p));
  const common = async () => ({
    vehicleSessionId: session,
    vehicleEpoch: (await read()).vehicle.vehicleEpoch,
  });
  const status = () =>
    send("CAR_STATUS", {
      vehicleSessionId: session,
      statusSeq: ++status.seq,
      restrictionKnown: true,
      restricted: false,
      foreground: true,
      uiContext: "navigation",
    });
  status.seq = 0;
  const open = () =>
    send("CAR_SESSION_OPEN", {
      deviceId: device,
      vehicleSessionId: session,
      pendingAttempts: [],
      navigationSource: source,
    });
  await open();
  await status();
  await send("CAR_START_TRIP", {
    vehicleSessionId: session,
    origin: "demo_preset",
    presetId: "gangneung-01",
  });
  const evidence = (wps = [], after = 100) => {
    const snap = (at) => ({
      sessionId: sdk,
      querySeq: ++query,
      startedAt: at,
      completedAt: at + 100,
      destination: d,
      waypoints: wps,
      naviMode: "ROUTE_GUIDING",
      isRouting: false,
    });
    return {
      first: snap(after + 1),
      second: snap(after + 1201),
      lookup: {
        sessionId: sdk,
        receivedAt: 0,
        poiId: place.poiId,
        point: { ...place, latitude: 37.4127749, longitude: 127.0947566 },
      },
    };
  };
  const observe = async (e) =>
    send("NAV_OBSERVE", { ...(await common()), source: "real", evidence: e });
  const approve = async (op, e) => {
    await observe(e);
    return send("NAV_APPROVE", {
      ...(await common()),
      operation: op,
      reviewed: e,
      ownedAttemptId:
        op === "remove" ? (await read()).navigation.owned.attemptId : null,
    });
  };
  const begin = async (a) => {
    const c = await envelope("NAV_DISPATCH_BEGIN", {
      ...(await common()),
      attemptId: a.attemptId,
      executionRecordId: randomUUID(),
      dispatchAt: a.before.second.completedAt + 1,
    });
    const r = await post(c);
    return { c, r, a: r.state.navigation.attempts.at(-1) };
  };
  const report = async (a, outcome, evidence) =>
    send("NAV_REPORT", {
      ...(await common()),
      attemptId: a.attemptId,
      executionRecordId: a.executionRecordId,
      reportId: randomUUID(),
      outcome,
      evidence,
    });
  const add = async () => {
    const r = await approve("add", evidence());
    const b = await begin(r.state.navigation.attempts.at(-1));
    await report(b.a, "applied", evidence([m], b.a.dispatchAt));
    return b;
  };
  return {
    read,
    web: () => app.read("web", randomUUID()),
    receipt: (c) => app.receipt("car", null, c.runId, c.commandId),
    post,
    send,
    envelope,
    common,
    status,
    evidence,
    observe,
    approve,
    begin,
    report,
    add,
    file,
    advance: (n) => (clock += n),
    reopen: async () => {
      session = randomUUID();
      await open();
      status.seq = 0;
      await status();
    },
    restart: async () => {
      app = coordinator(file, JSON.parse(await readFile(file)), {
        now: () => clock,
      });
      await read();
      await status();
    },
  };
}
test("driver approval grants one transient execution lease; replay, receipt and projection cannot dispatch", async (t) => {
  const f = await fixture(t),
    r = await f.approve("add", f.evidence()),
    b = await f.begin(r.state.navigation.attempts.at(-1));
  assert.equal(b.r.execution.granted, true);
  assert.equal((await f.post(b.c)).execution, undefined);
  assert.equal(JSON.stringify(await f.read()).includes("granted"), false);
  const cmd = await f.envelope("NAV_DISPATCH_BEGIN", b.c.payload);
  await assert.rejects(f.post(cmd), { code: "NAV_NOT_READY" });
});
test("actual double SDK observations verify add and owned FIRST removal while preserving D and raw 0,0", async (t) => {
  const f = await fixture(t);
  await f.add();
  assert.deepEqual((await f.read()).navigation.owned.waypoint, m);
  const r = await f.approve("remove", f.evidence([m], 3000)),
    b = await f.begin(r.state.navigation.attempts.at(-1));
  await f.report(b.a, "removed", f.evidence([], b.a.dispatchAt));
  assert.equal((await f.read()).navigation.owned, null);
  assert.deepEqual(
    (await f.read()).navigation.attempts.map((a) => a.outcome),
    ["applied", "removed"],
  );
});
test("no approval while restricted, paused, unsupported, stale or outside navigation screen", async (t) => {
  for (const patch of [
    { restricted: true },
    { foreground: false },
    { uiContext: "home" },
  ]) {
    const f = await fixture(t);
    const e = f.evidence();
    await f.observe(e);
    await f.send("CAR_STATUS", {
      vehicleSessionId: (await f.common()).vehicleSessionId,
      statusSeq: 100,
      restrictionKnown: true,
      restricted: false,
      foreground: true,
      uiContext: "navigation",
      ...patch,
    });
    await assert.rejects(
      f.send("NAV_APPROVE", {
        ...(await f.common()),
        operation: "add",
        reviewed: e,
        ownedAttemptId: null,
      }),
      { code: "RESTRICTED" },
    );
  }
  const f = await fixture(t, "unsupported");
  await assert.rejects(f.observe(f.evidence()), { code: "NAV_NOT_READY" });
  const g = await fixture(t);
  const e = g.evidence();
  await g.observe(e);
  g.advance(2001);
  await g.status();
  await assert.rejects(
    g.send("NAV_APPROVE", {
      ...(await g.common()),
      operation: "add",
      reviewed: e,
      ownedAttemptId: null,
    }),
    { code: "NAV_NOT_READY" },
  );
});
test("foreign waypoint, changed review and unknown execution prevent another mutation", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.approve("add", f.evidence([m])), {
    code: "NAV_NOT_READY",
  });
  const e = f.evidence();
  await f.observe(e);
  const reviewed = structuredClone(e);
  reviewed.second.destination.name = "other";
  await assert.rejects(
    f.send("NAV_APPROVE", {
      ...(await f.common()),
      operation: "add",
      reviewed,
      ownedAttemptId: null,
    }),
    { code: "NAV_NOT_READY" },
  );
  const r = await f.approve("add", f.evidence()),
    b = await f.begin(r.state.navigation.attempts.at(-1));
  await f.report(b.a, "unknown", null);
  await assert.rejects(f.approve("add", f.evidence()), {
    code: "NAV_NOT_READY",
  });
});
test("zero coordinate compatibility requires exact current POI and independently verified location", async (t) => {
  const f = await fixture(t),
    r = await f.approve("add", f.evidence()),
    b = await f.begin(r.state.navigation.attempts.at(-1));
  for (const mutate of [
    (e) => (e.second.waypoints[0].poiId = ""),
    (e) => (e.lookup.point.latitude = 37.485),
    (e) => (e.first.startedAt = b.a.dispatchAt),
    (e) => (e.second.startedAt = e.first.completedAt + 999),
    (e) => (e.second.destination.longitude += 0.01),
  ]) {
    const e = structuredClone(f.evidence([m], b.a.dispatchAt));
    mutate(e);
    await assert.rejects(f.report(b.a, "applied", e), {
      code: "NAV_NOT_READY",
    });
  }
  await f.report(b.a, "unknown", null);
  await f.report(b.a, "applied", f.evidence([m], b.a.dispatchAt));
  assert.equal(
    (await f.read()).navigation.attempts[0].reports[0].outcome,
    "unknown",
  );
  assert.equal((await f.read()).navigation.attempts[0].outcome, "applied");
});
test("restart clears observations and session epoch blocks stale executor; settled ownership persists", async (t) => {
  const f = await fixture(t);
  await f.add();
  await f.restart();
  assert.equal((await f.read()).navigation.observation, null);
  assert.ok((await f.read()).navigation.owned);
  const old = await f.common();
  await f.reopen();
  await assert.rejects(
    f.send("NAV_OBSERVE", { ...old, source: "real", evidence: f.evidence() }),
    { code: "STALE_STATE" },
  );
  assert.equal((await f.read()).navigation.attempts[0].outcome, "applied");
  const web = await f.envelope(
    "NAV_APPROVE",
    {
      ...(await f.common()),
      operation: "add",
      reviewed: f.evidence(),
      ownedAttemptId: null,
    },
    "web",
  );
  await assert.rejects(f.post(web), { code: "INVALID_PAYLOAD" });
});
test("unexecuted approval can be explicitly canceled; lease cannot be canceled into a false removal", async (t) => {
  const f = await fixture(t),
    r = await f.approve("add", f.evidence()),
    a = r.state.navigation.attempts.at(-1);
  await f.send("NAV_CANCEL", { ...(await f.common()), attemptId: a.attemptId });
  assert.equal(
    (await f.read()).navigation.attempts[0].outcome,
    "not_dispatched",
  );
  const r2 = await f.approve("add", f.evidence()),
    b = await f.begin(r2.state.navigation.attempts.at(-1));
  await assert.rejects(
    f.send("NAV_CANCEL", { ...(await f.common()), attemptId: b.a.attemptId }),
    { code: "NAV_NOT_READY" },
  );
  await f.report(b.a, "not_dispatched", null);
  assert.equal((await f.read()).navigation.owned, null);
});

test("lost grant response recovers a receipt without another grant; web hides location history", async (t) => {
  const f = await fixture(t),
    r = await f.approve("add", f.evidence()),
    b = await f.begin(r.state.navigation.attempts.at(-1));
  const receipt = await f.receipt(b.c);
  assert.equal(receipt.status, "applied");
  assert.equal(receipt.execution, undefined);
  assert.equal(receipt.receipt.replayed, true);
  assert.equal((await f.web()).navigation, null);
  await f.report(b.a, "not_dispatched", null);
  assert.equal(
    (await f.read()).navigation.attempts.at(-1).outcome,
    "not_dispatched",
  );
});
test("journal reserved before a rejected grant reports not_dispatched without claiming a removal", async (t) => {
  const f = await fixture(t),
    r = await f.approve("add", f.evidence()),
    a = r.state.navigation.attempts.at(-1);
  await f.report(
    { ...a, executionRecordId: randomUUID() },
    "not_dispatched",
    null,
  );
  assert.equal(
    (await f.read()).navigation.attempts.at(-1).dispatch,
    "not_started",
  );
  assert.equal((await f.read()).navigation.owned, null);
});
