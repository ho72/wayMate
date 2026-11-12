import { test } from "node:test";
import assert from "node:assert/strict";
import { browser } from "../helpers/operator-browser.mjs";
test("operator message response submits the current thread with reply, never a meeting acceptance", async () => {
  const b = await browser();
  b.applied();
  await b.poll();
  const target = {
    kind: "message",
    requestId: "message-request",
    connectionId: "connection",
    threadId: "thread",
  };
  b.setState({
    runId: "run",
    runSeq: 1,
    version: 4,
    social: {
      pendingResponses: [target],
      messageResponseEnabled: true,
      meeting: { status: "confirmed" },
    },
  });
  await b.poll();
  const card = b.requests.children[0],
    button = card.children.find((x) => typeof x.onclick === "function");
  assert.equal(button.textContent, "B 메시지 답변");
  assert.equal(button.disabled, false);
  await button.onclick();
  const posts = b.calls.filter((x) => x.method === "POST");
  assert.equal(posts.length, 1);
  const sent = JSON.parse(posts[0].body);
  assert.deepEqual(sent.target, target);
  assert.deepEqual(sent.payload, { decision: "reply" });
});

test("operator keeps a blocked message visible, disables sending, then enables the same request", async () => {
  const b = await browser();
  b.applied();
  await b.poll();
  const target = {
    kind: "message",
    requestId: "request",
    connectionId: "connection",
    threadId: "thread",
  };
  b.setState({
    social: {
      pendingResponses: [target],
      meeting: { status: "none" },
      messageResponseEnabled: false,
    },
  });
  await b.poll();
  let card = b.requests.children[0];
  assert.ok(card.children.some((x) => /요청은 대기 중/.test(x.textContent)));
  assert.equal(
    card.children.find((x) => typeof x.onclick === "function").disabled,
    true,
  );
  assert.equal(b.calls.filter((x) => x.method === "POST").length, 0);
  b.setState({
    social: {
      pendingResponses: [target],
      meeting: { status: "none" },
      messageResponseEnabled: true,
    },
  });
  await b.poll();
  card = b.requests.children[0];
  assert.equal(
    card.children.find((x) => typeof x.onclick === "function").disabled,
    false,
  );
});
