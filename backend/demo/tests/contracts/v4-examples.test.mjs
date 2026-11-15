import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertContract } from "../../server/v4/validation.mjs";
const root = new URL("../../shared/examples/v4/", import.meta.url);
for (const { file, definition } of JSON.parse(
  readFileSync(new URL("index.json", root)),
))
  test(`v4 ${definition}: ${file}`, () => {
    const value = JSON.parse(readFileSync(new URL(file, root)));
    assertContract(definition, value);
    assert.equal(value.schemaVersion ?? value.state?.schemaVersion, 4);
  });
