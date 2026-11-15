import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import { DatabaseSync } from "node:sqlite";
import { vehicleFixture } from "./helpers/vehicle-fixture.mjs";
const schema = JSON.parse(
  await readFile(
    new URL("../contracts/vehicle-v1.schema.json", import.meta.url),
    "utf8",
  ),
);
const validate = new Ajv({ strict: false }).compile(schema);
test("all native states and shared Android fixture satisfy the published contract", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    d = f.newDevice(),
    e = await f.enroll(d),
    states = [e.data];
  await f.request(u, "/api/vehicles/pair", { code: e.data.pairing.code });
  states.push((await f.sync(d)).data);
  await f.native(d, "confirm", {
    pairingId: e.data.pairing.id,
    decision: "accept",
  });
  d.pairingId = e.data.pairing.id;
  const trip = f.saveTrip(u);
  await f.publish(u, d, f.body(u, d, trip));
  states.push((await f.sync(d)).data);
  states.push((await f.ack(d, states.at(-1).delivery)).data);
  await f.native(d, "unpair", { pairingId: d.pairingId });
  states.push((await f.sync(d)).data);
  for (const state of states)
    assert.ok(validate(state), JSON.stringify(validate.errors));
  const fixture = JSON.parse(
    await readFile(
      new URL("../contracts/examples/received.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(validate(fixture), JSON.stringify(validate.errors));
  assert.deepEqual(
    fixture,
    JSON.parse(
      await readFile(
        new URL(
          "../../vehicle-app/app/src/androidTestMock/assets/personal-received.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
});
test("v1 migration preserves accounts, sessions, confirmed trips and messages", async (t) => {
  const f = await vehicleFixture(t),
    u = await f.register(),
    trip = f.saveTrip(u);
  const before = f.repo().getUser(u.id);
  // Remove only v2 objects from a fresh fixture, reconstructing the pre-feature v1 schema.
  const db = new DatabaseSync(f.file);
  db.exec(
    "DROP TABLE vehicle_deliveries; DROP TABLE vehicle_pairings; DROP TABLE vehicles; PRAGMA user_version=1;",
  );
  db.close();
  await f.restart();
  assert.deepEqual(f.repo().getUser(u.id), before);
  const restored = await f.request(u, "/api/session");
  assert.equal(restored.status, 200);
  assert.equal(restored.data.trips[0].id, trip);
  assert.equal(restored.data.vehicles.length, 0);
  const d = await f.paired(u);
  assert.equal((await f.sync(d)).data.status, "active");
});

test("maximum Unicode travel snapshot fits the native bounded response reader", async () => {
  const { PLAN } = await import("./helpers/vehicle-fixture.mjs");
  const frame = JSON.parse(
    await readFile(
      new URL("../contracts/examples/received.json", import.meta.url),
      "utf8",
    ),
  );
  const plan = frame.delivery.snapshot.trip.plan;
  plan.title = "🌊".repeat(80);
  plan.destination = "🌊".repeat(100);
  plan.summary = "🌊".repeat(800);
  plan.days = Array.from({ length: 14 }, (_, i) => ({
    dayNumber: i + 1,
    date: null,
    stops: Array.from({ length: 12 }, () => ({
      ...PLAN.days[0].stops[0],
      title: "🌊".repeat(100),
      description: "🌊".repeat(500),
      placeQuery: "🌊".repeat(150),
    })),
  }));
  plan.notes = Array(12).fill("🌊".repeat(300));
  assert.ok(validate(frame), JSON.stringify(validate.errors));
  assert.ok(Buffer.byteLength(JSON.stringify(frame)) < 1048576);
});
