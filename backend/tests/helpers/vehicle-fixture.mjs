import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { startService } from "../../server/http.mjs";
export const PARKED = {
  known: true,
  requiresDo: false,
  activeRestrictions: 0,
  foreground: true,
};
export const PLAN = {
  title: "내 바다 여행",
  destination: "강릉",
  startDate: null,
  endDate: null,
  summary: "내가 확인한 계획",
  days: [
    {
      dayNumber: 1,
      date: null,
      stops: [
        {
          time: "13:00",
          title: "해변 산책",
          description: "천천히 걸어요",
          category: "walk",
          placeQuery: "강릉 해변",
        },
      ],
    },
  ],
  notes: ["지도에서 확인해요"],
};
const agent = {
  name: "fixture",
  async run() {
    return { reply: "검수 응답" };
  },
};
export async function vehicleFixture(t, extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), "waymate-vehicle-")),
    file = join(dir, "data.sqlite");
  let clock = 1000000,
    app = await startService({ file, port: 0, agent, vehicleNow: () => clock, ...extra });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  async function request(
    u,
    path,
    body,
    method = body === undefined ? "GET" : "POST",
    extra = {},
  ) {
    const base = `http://127.0.0.1:${app.port}`,
      res = await fetch(base + path, {
        method,
        headers: {
          Origin: base,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(u?.cookie ? { Cookie: u.cookie, "X-CSRF-Token": u.csrf } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const data = await res.json();
    if (u && res.headers.get("set-cookie"))
      u.cookie = res.headers.get("set-cookie").split(";")[0];
    if (u && data.csrf) {
      u.csrf = data.csrf;
      u.id = data.user.id;
    }
    return { status: res.status, data };
  }
  async function register(handle = "traveler-a") {
    const u = {};
    const r = await request(u, "/api/auth/register", {
      handle,
      password: "A-synthetic-password-2026",
      displayName: handle,
    });
    if (r.status !== 200) throw new Error("Registration fixture failed");
    return u;
  }
  const newDevice = () => ({
    id: randomUUID(),
    token: randomBytes(32).toString("base64url"),
    name: "내 차",
  });
  async function native(d, path, body, extra = {}) {
    const r = await fetch(`http://127.0.0.1:${app.port}/api/vehicle/` + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Waymate-Device-Id": d.id,
        Authorization: "Bearer " + d.token,
        ...extra,
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  }
  const enroll = (d) =>
    native(d, "enroll", { deviceId: d.id, deviceToken: d.token, name: d.name });
  const sync = (d, ux = PARKED) => native(d, "sync", { ux });
  async function paired(u) {
    const d = newDevice(),
      e = await enroll(d),
      c = await request(u, "/api/vehicles/pair", { code: e.data.pairing.code });
    await sync(d);
    const r = await native(d, "confirm", {
      pairingId: c.data.pairing.pairingId,
      decision: "accept",
    });
    if (r.status !== 200) throw new Error("Pairing fixture failed");
    d.pairingId = r.data.pairing.id;
    return d;
  }
  function saveTrip(u, plan = PLAN) {
    const repo = app.repo;
    repo.consent(u.id, true);
    const chat = repo.newChat(u.id),
      turn = repo.beginTurn(u.id, chat.id, {
        requestId: randomUUID(),
        message: "비공개 원문",
        expectedVersion: 0,
      }),
      id = randomUUID();
    repo.finishTurn(u.id, turn.id, turn.attempt, {
      reply: "개인 답변",
      events: [],
      drafts: [
        {
          id,
          kind: "trip",
          body: structuredClone(plan),
          baseProfileVersion: repo.getUser(u.id).profileVersion,
        },
      ],
    });
    return repo.confirmDraft(u.id, id).id;
  }
  const body = (u, d, tripId, expectedRevision = 0) => ({
    requestId: randomUUID(),
    pairingId: d.pairingId,
    expectedRevision,
    tripId,
    profileVersion: app.repo.getUser(u.id).profileVersion,
  });
  const publish = (u, d, b) =>
    request(u, `/api/vehicles/${d.id}/deliveries`, b);
  const ack = (d, delivery) =>
    native(d, "ack", {
      pairingId: d.pairingId,
      deliveryId: delivery.id,
      revision: delivery.revision,
    });
  return {
    base: () => `http://127.0.0.1:${app.port}`,
    request,
    register,
    newDevice,
    native,
    enroll,
    sync,
    paired,
    saveTrip,
    body,
    publish,
    ack,
    file,
    dir,
    repo: () => app.repo,
    advance: (ms) => {
      clock += ms;
    },
    now: () => clock,
    restart: async () => {
      await app.close();
      app = await startService({
        file,
        port: 0,
        agent,
        vehicleNow: () => clock,
        ...extra,
      });
    },
  };
}
