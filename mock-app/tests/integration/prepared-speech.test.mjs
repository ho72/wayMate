import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { GENERAL_CALL, FAMILIAR_CALL } from "../../shared/config/call-v4.mjs";
import {
  GENERAL_MEETING,
  FAMILIAR_MEETING,
  TOGETHER_SCENE,
  OWN_QUESTIONS,
  OWN_CLOSINGS,
} from "../../shared/config/ending-v4.mjs";
const root = new URL("../../assets/audio/prepared-v1/", import.meta.url);
test("bundled audio includes both call samples and every ending narration, with valid unambiguous assets", async () => {
  const index = JSON.parse(await readFile(new URL("index.json", root)));
  assert.equal(index.source, "prepared_synthetic_speech");
  const hashes = new Set();
  for (const entry of index.entries) {
    assert.equal(
      createHash("sha256").update(entry.text.normalize("NFC")).digest("hex"),
      entry.sha256Text,
    );
    assert.ok(!hashes.has(entry.sha256Text));
    hashes.add(entry.sha256Text);
    assert.match(entry.file, /^speech_[0-9a-f]{24}\.m4a$/);
    const bytes = await readFile(new URL(entry.file, root));
    assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
    assert.ok(bytes.length > 1000);
  }
  const texts = [
    ...GENERAL_CALL,
    ...FAMILIAR_CALL,
    ...GENERAL_MEETING,
    ...FAMILIAR_MEETING,
    ...TOGETHER_SCENE,
  ].map((x) => x.text);
  for (const q of OWN_QUESTIONS)
    for (const closing of Object.values(OWN_CLOSINGS))
      texts.push(q.reply + " " + closing);
  for (const text of texts)
    assert.ok(
      index.entries.some((e) => e.text === text),
      `Missing prepared narration: ${text}`,
    );
});
