import { test } from "node:test";
import assert from "node:assert/strict";
import { browser, key, command } from "../helpers/operator-browser.mjs";
const resetKey = "waymate.operator.reset.v4";
async function ready() {
  const b = await browser();
  b.setState({
    runId: "run",
    runSeq: 1,
    version: 4,
    actionBindings: {
      RESET_BEGIN: {
        commandType: "RESET_BEGIN",
        payload: {},
        target: { runId: "run" },
      },
    },
  });
  await b.poll();
  return b;
}
async function confirm(b) {
  b.element("begin-reset").onclick();
  assert.equal(b.element("reset-dialog").open, true);
  b.element("confirm-reset").onclick();
  await b.poll();
}

test("operator may start reset while a B response is unknown; rejecting reset POST keeps B response", async () => {
  const b = await ready();
  assert.equal(b.element("begin-reset").disabled, false);
  b.fault((_path, opts) =>
    opts.method === "POST" && JSON.parse(opts.body).type === "RESET_BEGIN"
      ? 500
      : null,
  );
  await confirm(b);
  const posts = b.calls.filter((x) => x.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(JSON.parse(posts[0].body).type, "RESET_BEGIN");
  assert.equal(b.memory.get(key), JSON.stringify(command));
  assert.equal(b.memory.has(resetKey), false);
});

test("lost reset response survives GET failure then recovers by receipt without another POST", async () => {
  const b = await ready();
  b.fault((_path, opts) =>
    opts.method === "POST" ? new TypeError("lost response") : null,
  );
  await confirm(b);
  const original = b.memory.get(resetKey);
  assert.ok(original);
  assert.equal(b.memory.get(key), JSON.stringify(command));
  b.fault((_path, opts) => (opts.method === "GET" ? 500 : null));
  await b.poll();
  assert.equal(b.memory.get(resetKey), original);
  assert.equal(b.memory.get(key), JSON.stringify(command));
  b.fault(null);
  b.applied(JSON.parse(original).commandId);
  const posts = b.calls.filter((x) => x.method === "POST").length;
  await b.poll();
  assert.equal(b.memory.has(resetKey), false);
  assert.equal(b.calls.filter((x) => x.method === "POST").length, posts);
  assert.equal(b.memory.get(key), JSON.stringify(command));
});

test("observing reset closes old B pending and disables old response actions", async () => {
  const b = await ready();
  b.setState({
    reset: { runId: "run", id: "reset", blockedReasons: ["차량 ACK 대기"] },
  });
  await b.poll();
  assert.equal(b.memory.has(key), false);
  assert.equal(b.element("begin-reset").disabled, true);
  assert.match(b.element("reset-summary").textContent, /차량 ACK/);
});
