import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertLegacyContract } from "../../server/validation.mjs";
const base = new URL("../../shared/examples/", import.meta.url);
const index = JSON.parse(await readFile(new URL("index.json", base)));
for (const { file, definition } of index)
  test(`shared ${definition}: ${file}`, async () => {
    assertLegacyContract(
      definition,
      JSON.parse(await readFile(new URL(file, base))),
    );
  });
test("car contract rejects peer data and unsupported avatar", async () => {
  const h = JSON.parse(await readFile(new URL("handoff-my-trip.json", base)));
  assert.throws(() =>
    assertLegacyContract("handoff", { ...h, peer: { alias: "B" } }),
  );
  assert.throws(() =>
    assertLegacyContract("handoff", {
      ...h,
      owner: { ...h.owner, avatarId: "unknown" },
    }),
  );
});
