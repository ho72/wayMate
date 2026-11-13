import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixture } from "../helpers/v4-fixture.mjs";
import { serializeStore, validateStore } from "../../server/v4/state.mjs";
import { atomicSave } from "../../server/store.mjs";

const encoded = (state) => serializeStore(state).toString();

test("cached immutable audit JSON preserves exact disk format, new receipts and mutable business fields", async (t) => {
  const f = await fixture(t);
  await f.connect();
  await f.activate();
  await f.meeting();
  const s = JSON.parse(await readFile(f.file));
  validateStore(s);
  const first = encoded(s);
  assert.equal(first, JSON.stringify(s));
  assert.equal(encoded(s), first);
  const callerBytes = serializeStore(s);
  callerBytes.fill(0);
  assert.equal(encoded(s), first);
  s.vehicle.statusSeq++;
  s.version++;
  assert.notEqual(encoded(s), first);
  assert.equal(encoded(s), JSON.stringify(s));
  const id = Object.keys(s.receipts)[0];
  const replacement = structuredClone(s.receipts[id]);
  replacement.command.expectedVersion++;
  s.receipts[id] = replacement;
  validateStore(s);
  assert.equal(encoded(s), JSON.stringify(s));
  await f.act("RESET_BEGIN", "operator");
  await f.act("RESET_ACK", "car");
  const archived = JSON.parse(await readFile(f.file));
  validateStore(archived);
  assert.equal(encoded(archived), JSON.stringify(archived));
  assert.equal(await readFile(f.file, "utf8"), JSON.stringify(archived));
});
test("encoder failure preserves the committed file and removes the uncommitted temporary file", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "waymate-encode-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "state.json");
  await atomicSave(file, { value: "committed" });
  await assert.rejects(
    atomicSave(file, { value: "new" }, undefined, function* () {
      yield Buffer.from("partial");
      throw new Error("encode failed");
    }),
    /encode failed/,
  );
  assert.equal(await readFile(file, "utf8"), '{"value":"committed"}');
  assert.deepEqual(await readdir(dir), ["state.json"]);
});
