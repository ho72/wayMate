import { test } from "node:test";
import assert from "node:assert/strict";
import { browser } from "../helpers/operator-browser.mjs";
const target = {
  kind: "final",
  finalId: "final",
  finalRound: 1,
  requestId: "both-request",
};
const bindings = {
  B_FINAL_TOGETHER: {
    commandType: "B_RESPONSE",
    target,
    payload: { decision: "together" },
  },
  B_FINAL_MY_AGENT: {
    commandType: "B_RESPONSE",
    target,
    payload: { decision: "my_agent" },
  },
};
async function ready() {
  const b = await browser();
  b.applied();
  await b.poll();
  b.setState({
    runId: "run",
    runSeq: 1,
    version: 4,
    journey: {
      phase: "pending",
      replay: false,
      peerIntroSeen: true,
      final: { id: "final", round: 1, status: "pending", myChoice: null },
    },
    actionBindings: bindings,
  });
  await b.poll();
  return b;
}
test("operator opens both B choices before A submits and posts only the current B target", async () => {
  const b = await ready();
  const controls = b.element("journey-controls"),
    button = controls.children.find(
      (e) => e.textContent === "B 내 캐릭터와 여행 이어가기",
    );
  assert.equal(button.disabled, false);
  assert.ok(
    controls.children.find((e) => e.textContent === "B 함께 여행 이어가기"),
  );
  await button.onclick();
  const c = JSON.parse(b.calls.find((x) => x.method === "POST").body);
  assert.deepEqual(c.target, target);
  assert.deepEqual(c.payload, { decision: "my_agent" });
});
test("recovering an old B receipt after replay does not submit a choice to the new round", async () => {
  const b = await ready();
  b.fault((_, opts) => (opts.method === "POST" ? new TypeError("lost") : null));
  await b
    .element("journey-controls")
    .children.find((e) => e.textContent === "B 함께 여행 이어가기")
    .onclick();
  const saved = JSON.parse(b.memory.get("waymate.operator.pending.v4"));
  b.fault(null);
  b.applied(saved.commandId);
  b.setState({
    journey: {
      phase: "pending",
      replay: true,
      final: { id: "new-final", round: 2, status: "pending", myChoice: null },
    },
    actionBindings: {
      ...bindings,
      B_FINAL_TOGETHER: {
        ...bindings.B_FINAL_TOGETHER,
        target: { ...target, finalId: "new-final", finalRound: 2 },
      },
    },
  });
  const count = b.calls.filter((x) => x.method === "POST").length;
  await b.poll();
  assert.equal(b.memory.has("waymate.operator.pending.v4"), false);
  assert.equal(b.calls.filter((x) => x.method === "POST").length, count);
  assert.equal(
    b
      .element("journey-controls")
      .children.find((e) => e.textContent === "B 함께 여행 이어가기").disabled,
    false,
  );
});
