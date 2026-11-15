import test from "node:test";
import assert from "node:assert/strict";
import { scenarioControls, scenarioOperation } from "../web/journey-operator.mjs";

test("final choices use current operator bindings even when social pending responses are empty", () => {
  const target = { kind: "final", finalId: "new-final", finalRound: 2, requestId: "current-request" };
  const binding = { commandType: "B_RESPONSE", target, payload: { decision: "my_agent" } };
  const state = { social: { pendingResponses: [] }, actionBindings: { B_FINAL_MY_AGENT: binding } };
  assert.match(scenarioControls(state), /상대는 각자 여행/);
  assert.deepEqual(scenarioOperation(state, { key: "B_FINAL_MY_AGENT" }), binding);
  assert.equal(scenarioOperation(state, { key: "B_FINAL_TOGETHER" }), null);
  assert.equal(scenarioOperation({ actionBindings: {} }, { key: "B_FINAL_MY_AGENT" }), null);
});

test("mock results target the approved unsettled attempt and cannot turn removal into an add result", () => {
  const state = { actionBindings: {}, mockNavigation: { attempts: [{ attemptId: "remove", operation: "remove", outcome: "unknown" }] } };
  assert.equal(scenarioOperation(state, { attempt: "old-add", outcome: "applied" }), null);
  assert.equal(scenarioOperation(state, { attempt: "remove", outcome: "applied" }), null);
  assert.deepEqual(scenarioOperation(state, { attempt: "remove", outcome: "removed" }), {
    commandType: "NAV_MOCK_RESULT", target: { attemptId: "remove", operation: "remove" }, payload: { outcome: "removed" },
  });
  state.mockNavigation.attempts[0].outcome = "removed";
  assert.equal(scenarioOperation(state, { attempt: "remove", outcome: "removed" }), null);
  assert.doesNotMatch(scenarioControls(state), /모의 반영 확인/);
});
