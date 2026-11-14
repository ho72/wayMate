import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ServiceClient } from "../web/client.mjs";
import { appHarness } from "./helpers/app-harness.mjs";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { resolve, promise };
};
function client(fetchImpl) {
  const data = new Map();
  return new ServiceClient({
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    },
    fetchImpl,
  });
}
test("vehicle outbox replays exact body after lost response and stays isolated by account and device", async () => {
  const calls = [],
    c = client(async (path, opts) => {
      calls.push([path, opts.body]);
      if (calls.length === 1) throw new TypeError("lost");
      return Response.json({ vehicles: [] });
    });
  c.identity({ id: "A" }, "csrf-a");
  const id = randomUUID(),
    body = {
      requestId: randomUUID(),
      pairingId: randomUUID(),
      expectedRevision: 0,
      tripId: randomUUID(),
      profileVersion: 1,
    };
  await assert.rejects(c.sendVehicle(id, body));
  assert.deepEqual(c.vehiclePending(id), body);
  await assert.rejects(c.sendVehicle(id, body), { code: "VEHICLE_PENDING" });
  c.identity({ id: "B" }, "csrf-b");
  assert.equal(c.vehiclePending(id), null);
  c.identity({ id: "A" }, "csrf-a");
  assert.equal(c.vehiclePending(randomUUID()), null);
  await c.resolveVehicle(id);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(c.vehiclePending(id), null);
});
for (const status of [429, 503, 409, 404])
  test(`vehicle outbox ${status < 500 && status !== 429 ? "clears definitive" : "retains uncertain"} ${status} response`, async () => {
    const c = client(async () =>
      Response.json({ error: { message: "test" } }, { status }),
    );
    c.identity({ id: "A" }, "a");
    await assert.rejects(c.sendVehicle("device", { requestId: "r" }));
    assert.equal(!!c.vehiclePending("device"), status >= 500 || status === 429);
  });
test("late vehicle response cannot clear the new account outbox", async () => {
  const gate = deferred(),
    c = client(async () => {
      await gate.promise;
      return Response.json({ vehicles: [] });
    });
  c.identity({ id: "A" }, "a");
  const pending = c.sendVehicle("device", { requestId: "a" });
  c.identity({ id: "B" }, "b");
  c.storage.setItem(
    c.vehiclePendingKey("device"),
    JSON.stringify({ requestId: "b" }),
  );
  gate.resolve();
  await assert.rejects(pending, { code: "SESSION_CHANGED" });
  assert.equal(c.vehiclePending("device").requestId, "b");
  c.identity({ id: "A" }, "a");
  assert.equal(c.vehiclePending("device").requestId, "a");
});
async function ui(api = {}) {
  const h = await appHarness({
    identity() {},
    vehiclePending() {
      return null;
    },
    ...api,
  });
  h.identity({
    user: {
      id: "A",
      profileVersion: 1,
      profile: { displayName: "내 별명", avatar: "dragon" },
    },
  });
  h.S.view = "trips";
  h.S.trips = [{ id: "trip", title: "내 여행", days: [{}] }];
  h.S.vehicles = [
    {
      id: "device",
      pairingId: "binding",
      name: "내 차",
      status: "active",
      delivery: null,
    },
  ];
  return h;
}
test("mobile review never sends until confirmed; cancel and route changes discard approval", async () => {
  let sends = 0;
  const h = await ui({
    async sendVehicle() {
      sends++;
      return { vehicles: [] };
    },
  });
  h.reviewVehicleSend("trip", "device");
  assert.equal(sends, 0);
  assert.equal(
    h.context.document.getElementById("vehicle-confirm-dialog").open,
    true,
  );
  await h.click("vehicle-send-cancel");
  assert.equal(sends, 0);
  assert.equal(h.S.vehicleReview, null);
  h.reviewVehicleSend("trip", "device");
  await h.navigate("#home");
  await h.click("vehicle-send-confirm");
  assert.equal(sends, 0);
  assert.equal(h.S.vehicleReview, null);
});
test("mobile approval uses reviewed pairing and revision; a double click sends once", async () => {
  const gate = deferred(),
    calls = [];
  const h = await ui({
    async sendVehicle(id, body) {
      calls.push([id, structuredClone(body)]);
      await gate.promise;
      return { vehicles: [] };
    },
  });
  h.reviewVehicleSend("trip", "device");
  const reviewed = structuredClone(h.S.vehicleReview.body);
  const first = h.click("vehicle-send-confirm");
  await h.click("vehicle-send-confirm");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["device", reviewed]);
  gate.resolve();
  await first;
  assert.equal(h.S.vehicleReview, null);
  assert.equal(h.S.vehicleBusy, false);
});
test("late list cannot undo a successful revoke or overwrite another identity", async () => {
  const gate = deferred();
  const h = await ui({
    request: async (path) => {
      if (path === "/api/vehicles") {
        await gate.promise;
        return { vehicles: [{ id: "old" }] };
      }
      return { vehicles: [] };
    },
  });
  const read = h.refreshVehicles();
  await h.click("vehicle-revoke", { id: "device" });
  assert.equal(h.context.document.getElementById("vehicle-confirm-hint").hidden, true);
  await h.click("vehicle-send-confirm");
  gate.resolve();
  await read;
  assert.deepEqual(h.S.vehicles, []);
  const gate2 = deferred();
  const x = await ui({
    request: async () => {
      await gate2.promise;
      return { vehicles: [{ id: "A-private" }] };
    },
  });
  const r = x.refreshVehicles();
  x.identity({ user: { id: "B" } });
  gate2.resolve();
  await r;
  assert.equal(x.S.vehicles.length, 0);
});
test("late send result cannot change the new identity or leave its controls busy", async () => {
  const gate = deferred();
  const h = await ui({
    async sendVehicle() {
      await gate.promise;
      return { vehicles: [{ id: "A-private" }] };
    },
  });
  h.reviewVehicleSend("trip", "device");
  const send = h.click("vehicle-send-confirm");
  h.identity({ user: { id: "B" } });
  gate.resolve();
  await send;
  assert.equal(h.S.user.id, "B");
  assert.equal(h.S.vehicles.length, 0);
  assert.equal(h.S.vehicleBusy, false);
  assert.equal(h.S.vehicleReview, null);
});

test("login handle pattern compiles under the browser v flag and matches the server alphabet", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(
    new URL("../web/index.html", import.meta.url),
    "utf8",
  );
  const pattern = html.match(/pattern="([^"\n]+)"/)[1];
  const regex = new RegExp("^(?:" + pattern + ")$", "v");
  assert.ok(regex.test("my-name_2026.test"));
  assert.ok(!regex.test("a"));
  assert.ok(!regex.test("wrong/name"));
});
