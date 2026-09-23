import assert from "node:assert/strict";
import test from "node:test";
import { inspectChunkIdentities } from "./check-turbopack-chunk-identities.mjs";

test("rejects the seven-character SSR name from the demos production failure", () => {
  assert.throws(
    () => inspectChunkIdentities(["ssr/node_modules__pnpm_1y3zod3._.js"]),
    /collision-prone seven-character/,
  );
});

test("checks every chunk even when other chunks already use full identities", () => {
  assert.throws(
    () => inspectChunkIdentities(["_01abcdefghijk._.js", "_next-internal_actions_05wx04s.js"]),
    /collision-prone seven-character/,
  );
});

test("accepts complete identities including underscores in their base38 encoding", () => {
  assert.equal(inspectChunkIdentities([
    "ssr/node_modules__pnpm_01abcdefghijk._.js",
    "[root-of-the-server]__01abc_0defgh-._.js",
    "_next-internal_actions_21abcdefghijk.js",
    "[turbopack]_runtime.js",
  ]), 3);
});

test("refuses empty output or output from a different bundler", () => {
  assert.throws(() => inspectChunkIdentities([]), /No full-width/);
  assert.throws(() => inspectChunkIdentities(["123.js", "webpack-runtime.js"]), /No full-width/);
});
