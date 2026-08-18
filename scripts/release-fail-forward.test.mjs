import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseScript = await readFile(
  new URL("./release.sh", import.meta.url),
  "utf8",
);

function functionBody(name) {
  const start = releaseScript.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = releaseScript.indexOf("\n}\n", start);
  assert.notEqual(next, -1, `${name} must have a closing brace`);
  return releaseScript.slice(start, next + 3);
}

test("Pattern Patrol certification is advisory", () => {
  const body = functionBody("verify_patrol_delivery");
  assert.match(body, /if pnpm --silent patrol:delivery:check/);
  assert.match(body, /warn .*release remains fail-forward/);
  assert.doesNotMatch(body, /^\s*fail\s/m);
});

test("a busy serialized lane waits instead of terminating the release", () => {
  const body = functionBody("acquire_delivery_lease");
  assert.match(body, /while true/);
  assert.match(body, /sleep 5/);
  assert.doesNotMatch(body, /^\s*fail\s|exit 1/m);
});

test("post-push release gates cannot propagate a nonzero exit", () => {
  assert.match(
    releaseScript,
    /run-release-gates\.sh" --advisory \|\| true/,
  );
});
