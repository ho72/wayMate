import { test } from "node:test";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { vehicleFixture, PARKED, PLAN } from "./helpers/vehicle-fixture.mjs";

test("code retry and mobile request require a distinct explicit vehicle confirmation", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = f.newDevice(),
    e = await f.enroll(d);
  assert.equal(e.status, 200);
  assert.match(e.data.pairing.code, /^\d{8}$/);
  assert.equal((await f.enroll(d)).data.pairing.code, e.data.pairing.code);
  const c = await f.request(u, "/api/vehicles/pair", {
    code: e.data.pairing.code,
  });
  assert.equal(c.data.pairing.status, "requested");
  assert.equal((await f.sync(d)).data.delivery, null);
  assert.equal(
    (
      await f.native(d, "confirm", {
        pairingId: c.data.pairing.pairingId,
        decision: "accept",
      })
    ).data.status,
    "active",
  );
  assert.equal(
    (await f.request(u, "/api/vehicles")).data.vehicles[0].status,
    "active",
  );
  assert.equal(
    (await f.request(u, "/api/vehicles/pair", { code: e.data.pairing.code }))
      .status,
    404,
  );
});
test("unknown and cloned credentials cannot read or replace another device", async (t) => {
  const f = await vehicleFixture(t),
    d = f.newDevice();
  assert.equal((await f.sync(d)).status, 401);
  await f.enroll(d);
  const other = f.newDevice();
  other.id = d.id;
  assert.equal((await f.enroll(other)).status, 401);
  assert.equal((await f.sync(other)).status, 401);
  const u = await f.register(),
    p = await f.paired(u),
    x = f.newDevice();
  await f.enroll(x);
  await f.sync(x);
  assert.equal(
    (
      await f.native(x, "confirm", {
        pairingId: p.pairingId,
        decision: "accept",
      })
    ).status,
    409,
  );
});
test("browser cookies and Origin never authenticate a native route; CSRF and Host checks remain strict", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = f.newDevice();
  await f.enroll(d);
  assert.equal(
    (await f.native(d, "sync", { ux: PARKED }, { Cookie: u.cookie })).status,
    403,
  );
  assert.equal(
    (await f.native(d, "sync", { ux: PARKED }, { Origin: "http://127.0.0.1" }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.request(null, "/api/vehicles", undefined, "GET", {
        Authorization: "Bearer " + d.token,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.request(u, "/api/vehicles/pair", { code: "12345678" }, "POST", {
        "X-CSRF-Token": "wrong",
      })
    ).status,
    403,
  );
  const badHost = await new Promise((resolve, reject) => {
    const req = httpRequest(
      f.base() + "/api/session",
      { headers: { Host: "10.0.2.2:1", Cookie: u.cookie } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(badHost, 403);
});
test("claimed codes expire and renew in a different pairing generation", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = f.newDevice(),
    e = await f.enroll(d),
    c = await f.request(u, "/api/vehicles/pair", { code: e.data.pairing.code });
  f.advance(300001);
  await f.sync(d);
  assert.equal(
    (
      await f.native(d, "confirm", {
        pairingId: c.data.pairing.pairingId,
        decision: "accept",
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request(u, "/api/vehicles/pair", { code: e.data.pairing.code }))
      .status,
    404,
  );
  assert.notEqual((await f.enroll(d)).data.pairing.id, e.data.pairing.id);
});
test("a repeated claim is idempotent for its owner and cannot be stolen by another account", async (t) => {
  const f = await vehicleFixture(t),
    a = await f.register(),
    b = await f.register("traveler-b"),
    d = f.newDevice(),
    e = await f.enroll(d),
    c = await f.request(a, "/api/vehicles/pair", { code: e.data.pairing.code });
  assert.equal(
    (await f.request(a, "/api/vehicles/pair", { code: e.data.pairing.code }))
      .data.pairing.pairingId,
    c.data.pairing.pairingId,
  );
  assert.equal(
    (await f.request(b, "/api/vehicles/pair", { code: e.data.pairing.code }))
      .status,
    404,
  );
  await f.sync(d);
  assert.equal(
    (
      await f.native(d, "confirm", {
        pairingId: randomUUID(),
        decision: "accept",
      })
    ).status,
    409,
  );
});
test("only saved owner trips can be sent and the snapshot excludes private profile and chat data", async (t) => {
  const f = await vehicleFixture(t),
    a = await f.register(),
    b = await f.register("traveler-b"),
    d = await f.paired(a),
    trip = f.saveTrip(a),
    foreign = f.saveTrip(b);
  assert.equal((await f.publish(b, d, f.body(b, d, foreign))).status, 404);
  assert.equal((await f.publish(a, d, f.body(a, d, foreign))).status, 404);
  assert.equal((await f.publish(a, d, f.body(a, d, randomUUID()))).status, 404);
  assert.equal(
    (await f.publish(a, d, { ...f.body(a, d, trip), snapshot: {} })).status,
    422,
  );
  const stale = f.body(a, d, trip),
    account = f.repo().getUser(a.id);
  f.repo().profile(
    a.id,
    { ...account.profile, about: "비공개 소개", interests: ["비공개 취향"] },
    account.profileVersion,
  );
  assert.equal((await f.publish(a, d, stale)).status, 409);
  const sent = await f.publish(a, d, f.body(a, d, trip));
  assert.equal(sent.status, 200);
  const text = JSON.stringify(sent.data.delivery);
  for (const x of ["비공개 소개", "비공개 취향", "비공개 원문"])
    assert.ok(!text.includes(x));
  assert.deepEqual(Object.keys(sent.data.delivery.snapshot.owner).sort(), [
    "avatar",
    "displayName",
  ]);
  assert.deepEqual(sent.data.delivery.snapshot.trip.plan, PLAN);
});
test("lost-send replay, changed-body reuse and competing revisions cannot duplicate or revive a delivery", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = await f.paired(u),
    trip = f.saveTrip(u),
    body = f.body(u, d, trip),
    first = await f.publish(u, d, body),
    delivery = first.data.delivery;
  assert.equal(first.status, 200);
  assert.equal(delivery.acknowledgedAt, null);
  const retry = await f.publish(u, d, body);
  assert.equal(retry.data.delivery.id, delivery.id);
  assert.equal(retry.data.replayed, true);
  assert.equal(
    (await f.publish(u, d, { ...body, expectedRevision: 1 })).status,
    409,
  );
  assert.equal((await f.publish(u, d, f.body(u, d, trip))).status, 409);
  const a = await f.ack(d, delivery);
  assert.equal(a.data.delivery.acknowledgedAt, f.now());
  f.advance(1);
  assert.equal(
    (await f.ack(d, delivery)).data.delivery.acknowledgedAt,
    a.data.delivery.acknowledgedAt,
  );
  const second = (await f.publish(u, d, f.body(u, d, trip, 1))).data.delivery;
  assert.equal(second.revision, 2);
  assert.equal((await f.ack(d, delivery)).status, 409);
  assert.equal((await f.publish(u, d, body)).data.delivery.id, delivery.id);
  assert.equal((await f.sync(d)).data.delivery.id, second.id);
});
for (const [name, ux] of Object.entries({
  unknown: { ...PARKED, known: false },
  driving: { ...PARKED, requiresDo: true, activeRestrictions: 80 },
  nonzero: { ...PARKED, activeRestrictions: 1 },
  background: { ...PARKED, foreground: false },
}))
  test(`${name} blocks delivery, pairing confirmation and ACK`, async (t) => {
    const f = await vehicleFixture(t),
      u = await f.register(),
      d = await f.paired(u),
      trip = f.saveTrip(u),
      delivery = (await f.publish(u, d, f.body(u, d, trip))).data.delivery;
    assert.equal((await f.sync(d, ux)).data.delivery, null);
    assert.equal((await f.ack(d, delivery)).status, 409);
    assert.equal(
      (
        await f.native(d, "confirm", {
          pairingId: d.pairingId,
          decision: "accept",
        })
      ).status,
      409,
    );
  });
test("stale or backwards freshness and invalid reports cannot permit an ACK", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = await f.paired(u),
    trip = f.saveTrip(u),
    delivery = (await f.publish(u, d, f.body(u, d, trip))).data.delivery;
  f.advance(12000);
  assert.equal((await f.ack(d, delivery)).status, 409);
  assert.equal(
    (await f.sync(d, { ...PARKED, activeRestrictions: -1 })).status,
    422,
  );
  assert.equal((await f.sync(d, { ...PARKED, known: "true" })).status, 422);
  await f.sync(d);
  f.advance(-1);
  assert.equal((await f.ack(d, delivery)).status, 409);
});
test("revocation and rebind reject late ACKs and old-owner actions cannot affect a new owner", async (t) => {
  const f = await vehicleFixture(t),
    a = await f.register(),
    b = await f.register("traveler-b"),
    d = await f.paired(a),
    old = d.pairingId,
    trip = f.saveTrip(a),
    delivery = (await f.publish(a, d, f.body(a, d, trip))).data.delivery;
  await f.request(a, `/api/vehicles/${d.id}/revoke`, { pairingId: old });
  assert.equal((await f.sync(d)).data.status, "revoked");
  assert.equal((await f.ack(d, delivery)).status, 409);
  const e = await f.enroll(d),
    c = await f.request(b, "/api/vehicles/pair", { code: e.data.pairing.code });
  await f.sync(d);
  const pair = c.data.pairing.pairingId;
  await f.native(d, "confirm", { pairingId: pair, decision: "accept" });
  assert.equal((await f.ack(d, delivery)).status, 409);
  await f.request(a, `/api/vehicles/${d.id}/revoke`, { pairingId: old });
  assert.equal((await f.sync(d)).data.pairing.id, pair);
  assert.equal((await f.request(a, "/api/vehicles")).data.vehicles.length, 0);
  assert.equal(
    (await f.request(a, `/api/vehicles/${d.id}/revoke`, { pairingId: pair }))
      .status,
    404,
  );
});
test("vehicle decline or mobile cancel prevents late confirmation and requires a fresh code", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = f.newDevice(),
    e = await f.enroll(d),
    c = await f.request(u, "/api/vehicles/pair", { code: e.data.pairing.code });
  await f.sync(d);
  await f.native(d, "confirm", {
    pairingId: c.data.pairing.pairingId,
    decision: "decline",
  });
  assert.equal((await f.sync(d)).data.status, "revoked");
  const n = await f.enroll(d),
    claim = await f.request(u, "/api/vehicles/pair", {
      code: n.data.pairing.code,
    });
  await f.request(u, `/api/vehicles/${d.id}/revoke`, {
    pairingId: claim.data.pairing.pairingId,
  });
  assert.equal(
    (
      await f.native(d, "confirm", {
        pairingId: claim.data.pairing.pairingId,
        decision: "accept",
      })
    ).status,
    409,
  );
});
test("restart keeps user sessions, pairing and receipt; device tokens are hashed and never returned to mobile", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = await f.paired(u),
    trip = f.saveTrip(u),
    delivery = (await f.publish(u, d, f.body(u, d, trip))).data.delivery;
  await f.ack(d, delivery);
  await f.restart();
  assert.equal((await f.request(u, "/api/session")).data.trips[0].id, trip);
  const restored = await f.sync(d);
  assert.equal(restored.data.delivery.id, delivery.id);
  assert.ok(restored.data.delivery.acknowledgedAt);
  const db = new DatabaseSync(f.file, { readOnly: true });
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 2);
  const row = db.prepare("SELECT key_hash FROM vehicles WHERE id=?").get(d.id);
  assert.equal(row.key_hash.length, 64);
  assert.notEqual(row.key_hash, d.token);
  db.close();
  const text = JSON.stringify((await f.request(u, "/api/vehicles")).data);
  assert.ok(!text.includes(d.token));
  assert.ok(!text.includes("key_hash"));
});
test("code guesses are rate limited", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register();
  let r;
  for (let i = 0; i < 11; i++)
    r = await f.request(u, "/api/vehicles/pair", { code: "11111111" });
  assert.equal(r.status, 429);
});

test("native unlink is binding scoped and another device cannot ACK a delivery", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = await f.paired(u),
    other = await f.paired(u),
    trip = f.saveTrip(u),
    delivery = (await f.publish(u, d, f.body(u, d, trip))).data.delivery;
  assert.equal(
    (
      await f.native(other, "ack", {
        pairingId: d.pairingId,
        deliveryId: delivery.id,
        revision: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.native(d, "ack", {
        pairingId: d.pairingId,
        deliveryId: delivery.id,
        revision: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.native(d, "unpair", { pairingId: d.pairingId })).data.status,
    "revoked",
  );
  assert.equal((await f.ack(d, delivery)).status, 409);
  assert.equal((await f.sync(other)).data.status, "active");
});
