import { test } from "node:test";
import assert from "node:assert/strict";
import { browser, key, command } from "../helpers/operator-browser.mjs";

for (const path of ["receipt", "state"])
  for (const code of [403, 500]) {
    test(`operator preserves unknown B response after ${path} GET ${code} and retries the same command`, async () => {
      const b = await browser();
      b.fault((url, options) =>
        options.method === "GET" &&
        (path === "receipt"
          ? url.startsWith("/api/commands/")
          : url.startsWith("/api/state"))
          ? code
          : null,
      );
      await b.poll();
      assert.equal(b.memory.get(key), JSON.stringify(command));
      assert.ok(b.retry());
      assert.equal(b.calls.filter((c) => c.method === "POST").length, 0);
      b.fault(null);
      await b.retry().onclick();
      assert.equal(b.memory.has(key), false);
      const posts = b.calls.filter((c) => c.method === "POST");
      assert.equal(posts.length, 1);
      assert.deepEqual(JSON.parse(posts[0].body), command);
    });
  }

for (const code of [409, 500])
  test(`operator closes a definitively rejected B response POST ${code}`, async () => {
    const b = await browser();
    b.fault((_path, options) => (options.method === "POST" ? code : null));
    await b.retry().onclick();
    assert.equal(b.memory.has(key), false);
    await b.poll();
    assert.equal(b.retry(), undefined);
  });

for (const failure of [503, new TypeError("response lost")])
  test(`operator retains B response after uncertain POST ${typeof failure === "number" ? failure : "timeout"}`, async () => {
    const b = await browser();
    b.fault((_path, options) => (options.method === "POST" ? failure : null));
    await b.retry().onclick();
    assert.equal(b.memory.get(key), JSON.stringify(command));
    b.fault(null);
    b.applied();
    const count = b.calls.filter((c) => c.method === "POST").length;
    await b.poll();
    assert.equal(b.memory.has(key), false);
    assert.equal(b.calls.filter((c) => c.method === "POST").length, count);
  });
