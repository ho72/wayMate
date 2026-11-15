import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConnection } from "node:net";
import { once } from "node:events";
import { fixture } from "../helpers/v4-fixture.mjs";
import { startServer } from "../../server/v4/http.mjs";
test("shutdown drains already queued writes, then refuses any new work", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  const payload = (seq) => ({
    vehicleSessionId: f.session,
    statusSeq: seq,
    restrictionKnown: true,
    restricted: false,
    foreground: true,
    uiContext: "navigation",
  });
  const a = await f.envelope("CAR_STATUS", payload(20), "car"),
    b = await f.envelope("CAR_STATUS", payload(21), "car");
  const first = f.post(a),
    second = f.post(b);
  await f.close();
  assert.equal((await first).receipt.applied, true);
  assert.equal((await second).receipt.applied, true);
  assert.equal(JSON.parse(await readFile(f.file)).vehicle.statusSeq, 21);
  await assert.rejects(
    f.post(a),
    (e) => e.status === 503 && e.code === "UNAVAILABLE",
  );
});
test("HTTP shutdown closes a speculative idle connection and releases the writer lock exactly once", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "waymate-close-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "state.json"),
    app = await startServer({ file, port: 0 });
  const socket = createConnection({ host: "127.0.0.1", port: app.port });
  socket.on("error", () => {});
  t.after(() => socket.destroy());
  await once(socket, "connect");
  const a = app.close(),
    b = app.close();
  assert.equal(a, b);
  let timer;
  try {
    await Promise.race([
      a,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("idle connection blocked shutdown")),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
  await assert.rejects(access(file + ".lock"), (e) => e.code === "ENOENT");
  assert.equal(JSON.parse(await readFile(file)).schemaVersion, 4);
});
