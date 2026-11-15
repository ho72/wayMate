import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertContract } from "../../server/validation.mjs";
const base = new URL("../../shared/examples/v3/", import.meta.url);
const index = JSON.parse(await readFile(new URL("index.json", base)));
for (const { file, definition } of index)
  test(`v3 ${definition}: ${file}`, async () =>
    assertContract(
      definition,
      JSON.parse(await readFile(new URL(file, base))),
    ));
