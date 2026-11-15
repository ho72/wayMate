import { test } from "node:test";
import assert from "node:assert/strict";
import { browser } from "../helpers/operator-browser.mjs";
const base = {
  runId: "run",
  runSeq: 1,
  version: 4,
  social: { pendingResponses: [], meeting: { status: "none" } },
};
async function ready() {
  const b = await browser();
  b.applied();
  b.setState(base);
  await b.poll();
  return b;
}
test("operator mock result uses the current attempt, operation and run, with no real command", async () => {
  const b = await ready();
  b.setState({
    mockNavigation: {
      route: { destination: { name: "D" }, waypoints: [] },
      attempts: [
        { attemptId: "mock-current", operation: "remove", outcome: "unknown" },
      ],
    },
  });
  await b.poll();
  const panel = b.element("navigation-controls");
  const success = panel.children.find((x) => x.textContent === "모의 성공");
  assert.ok(success);
  await success.onclick();
  const sent = JSON.parse(b.calls.find((x) => x.method === "POST").body);
  assert.equal(sent.type, "NAV_MOCK_RESULT");
  assert.equal(sent.runId, "run");
  assert.deepEqual(sent.target, {
    attemptId: "mock-current",
    operation: "remove",
  });
  assert.deepEqual(sent.payload, { outcome: "removed" });
});
test("settled mock result exposes no mutation buttons and unregistered recovery stays disabled", async () => {
  const b = await ready();
  b.setState({
    mockNavigation: {
      route: { destination: { name: "D" }, waypoints: [] },
      attempts: [{ attemptId: "done", operation: "add", outcome: "failed" }],
    },
    recoveryStatus: {
      canConfirm: false,
      procedures: [],
      message: "검증 절차 없음",
    },
  });
  await b.poll();
  const panel = b.element("navigation-controls");
  assert.ok(!panel.children.some((x) => x.textContent === "모의 성공"));
  assert.ok(
    panel.children.find(
      (x) => x.textContent === "실제 복구 확인 · 등록 절차 없음",
    ).disabled,
  );
});
test("operator call acceptance respects restrictions while refusal remains a stop choice", async () => {
  const b = await ready();
  const target = {
    kind: "call",
    callId: "call",
    requestId: "request",
    connectionId: "connection",
  };
  b.setState({
    social: {
      pendingResponses: [target],
      meeting: { status: "none" },
      callResponseEnabled: false,
    },
  });
  await b.poll();
  const buttons = b.requests.children[0].children.filter((x) => x.onclick);
  assert.equal(buttons.find((x) => x.textContent === "B 수락").disabled, true);
  const decline = buttons.find((x) => x.textContent === "B 거절");
  assert.equal(decline.disabled, false);
  await decline.onclick();
  assert.deepEqual(
    JSON.parse(b.calls.find((x) => x.method === "POST").body).target,
    target,
  );
});
