// fillSecret never lets the filled value out through a thrown error (message or stack).
import test from "node:test";
import assert from "node:assert/strict";

import { fillSecret } from "./seat-browser.mjs";

const SECRET = "hunter2-Sup3rS3cret!";
const leaky = () =>
  new Error(`page.fill: Timeout 30000ms exceeded.\nCall log:\n  - fill("${SECRET}")\n  - waiting for locator("#password")`);

test("page + selector: the rethrown error carries no secret in message or stack", async () => {
  const page = { fill: async () => { throw leaky(); } };
  await assert.rejects(fillSecret(page, "#password", SECRET), (err) => {
    assert.ok(!err.message.includes(SECRET), "message leaked");
    assert.ok(!err.stack.includes(SECRET), "stack leaked");
    assert.match(err.message, /Timeout 30000ms exceeded/);
    return true;
  });
});

test("locator: value is the only argument and is scrubbed the same way", async () => {
  const seen = [];
  const locator = { fill: async (...a) => { seen.push(a); throw leaky(); } };
  await assert.rejects(fillSecret(locator, undefined, SECRET), (err) => {
    assert.ok(!err.message.includes(SECRET) && !err.stack.includes(SECRET));
    return true;
  });
  assert.deepEqual(seen[0].slice(0, 1), [SECRET]);
});

test("success path passes selector, value and options through", async () => {
  const calls = [];
  const page = { fill: async (...a) => { calls.push(a); } };
  await fillSecret(page, "#password", SECRET, { timeout: 10 });
  assert.deepEqual(calls[0], ["#password", SECRET, { timeout: 10 }]);
});

test("non-secret errors are untouched", async () => {
  const page = { fill: async () => { throw new Error("boom"); } };
  await assert.rejects(fillSecret(page, "#x", SECRET), /boom/);
});
