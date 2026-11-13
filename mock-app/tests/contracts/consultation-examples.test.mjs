import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertContract,
  assertConsultation,
} from "../../server/v4/validation.mjs";
const examples = new URL(
  "../../shared/examples/consultation-v1/",
  import.meta.url,
);
test("AI request/draft examples validate and confirmed AI handoff fixture stays in sync with Android", async () => {
  assertConsultation(
    "request",
    JSON.parse(await readFile(new URL("turn-request.json", examples))),
  );
  assertConsultation(
    "draft",
    JSON.parse(await readFile(new URL("draft.json", examples))),
  );
  const handoff = await readFile(
    new URL("handoff-confirmed-ai.json", examples),
    "utf8",
  );
  assertContract("handoff", JSON.parse(handoff));
  assert.equal(
    handoff,
    await readFile(
      new URL(
        "../../vehicle/app/src/androidTestMock/assets/handoff-confirmed-ai.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    JSON.parse(handoff).owner.summary.summarySource,
    "user_confirmed_ai",
  );
});
