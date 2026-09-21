// release-fail-forward.test.mjs — the ship path at its seams.
//
// Releasing is never harder than a plain `git push` (Arman, 2026-09-19/20).
// The behavioural guard is scripts/test-release-ship-path.sh (a dirty
// checkout, a diverged branch and a foreign push landing mid-release must
// still end with the tag on origin). This file guards the wiring the sandbox
// cannot see: that no check, gate, lease or self-test wall sits before the
// push; that after the push nothing can fail; that the after phase is
// detached; and that nothing is ever stashed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseScript = await readFile(new URL("./release.sh", import.meta.url), "utf8");
const code = releaseScript.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

const shipStart = code.indexOf('if [[ "$RELEASE_PHASE" == "ship" ]]; then');
const pushAt = code.indexOf('ship_mark "pushed ${RELEASE_SHA:0:9}');
const afterStart = code.indexOf("after_watch_rollout()");
assert.ok(shipStart > 0 && pushAt > shipStart && afterStart > pushAt, "ship path, push, after phase — in that order");
const beforePush = code.slice(shipStart, pushAt);
const afterPush = code.slice(pushAt, afterStart);
// A remedy string may NAME a check ("pnpm check:migrations:strict"); only an unquoted token RUNS one.
const unquoted = (text) => text.replace(/"(?:[^"\\]|\\.)*"/g, '""');

test("nothing but the fetch and the push can stop a release", () => {
  const fails = [...beforePush.matchAll(/\bfail "([^"]*)"/g)].map((m) => m[1]);
  for (const message of fails) {
    assert.match(
      message,
      /Cannot reach GitHub|assemble the release commit|Could not read the version|Could not write version|Could not assemble the release commit|Lost the push race|Cannot push to GitHub/,
      `a fail() before the push that is not GitHub or the worktree: ${message}`,
    );
  }
});

test("no check, gate, lease or self-test wall runs before the push", () => {
  for (const banned of [
    /pnpm check:/,
    /run-release-gates\.sh/,
    /checks\/run\.mjs/,
    /delivery-lease/,
    /patrol:delivery:check/,
    /release-outcome\.sh/,
    /check-release-surface-registration/,
    /protocol-sync/,
  ]) {
    assert.doesNotMatch(unquoted(beforePush), banned, `${banned} runs before the push`);
  }
});

test("after the push nothing fails: the ERR trap is cleared and errexit is off", () => {
  assert.match(afterPush, /trap - ERR\n\s*set \+e/);
  assert.doesNotMatch(afterPush, /\bfail "/);
  assert.doesNotMatch(afterPush, /\bexit 1\b/);
});

test("a failed migration, a conflicting local commit and a lost tag are findings, never stops", () => {
  assert.match(beforePush, /ship_finding "ERROR" "Migrations" "A pending migration failed to apply/);
  assert.match(code, /ship_finding "ERROR" "Git" "Local commits conflict with/);
  assert.match(afterPush, /ship_finding "ERROR" "Git" "Tag \$NEW_TAG did not reach/);
});

test("a lost push race is retried on the new main, up to five times; a network blip is not a race", () => {
  assert.match(code, /SHIP_PUSH_ATTEMPTS=5/);
  assert.match(beforePush, /SHIP_RACES=\$\(\(SHIP_RACES \+ 1\)\)/);
  assert.match(beforePush, /SHIP_BLIPS=\$\(\(SHIP_BLIPS \+ 1\)\)/);
});

test("the release commit is assembled with git plumbing on origin/main — no worktree, no branch, no stash", () => {
  assert.match(code, /git merge-tree --write-tree "\$SHIP_BASE" "\$SHIP_LOCAL_HEAD"/);
  assert.match(code, /git commit-tree "\$tree" "\$\{SHIP_PARENTS\[@\]\}" -m "\$RELEASE_COMMIT_MSG"/);
  assert.doesNotMatch(code, /git worktree add/);
  assert.doesNotMatch(code, /git stash/);
  assert.doesNotMatch(code, /git checkout -b/);
});

test("nothing in the release path resets any working folder", () => {
  assert.doesNotMatch(code, /git (-C "[^"]*" )?reset --hard/);
});

test("the clean run prints exactly the ship line; INFO never prints", () => {
  assert.match(afterPush, /echo "\$\{NEW_TAG\}  pushed, build started  \(\$\(\(SECONDS - SHIP_START\)\)s\)"/);
  assert.doesNotMatch(code, /^\s*info\b/m);
  assert.doesNotMatch(code, /\[INFO\]/);
});

test("everything else runs after the build started, detached, into the log", () => {
  assert.match(afterPush, /nohup "\$0" \$\{RELEASE_ORIGINAL_ARGS\[@\]\+"\$\{RELEASE_ORIGINAL_ARGS\[@\]\}"\} <\/dev\/null >>"\$\{RELEASE_LOG_FILE:-\/dev\/null\}" 2>&1 &/);
  assert.match(afterPush, /RELEASE_AFTER_PHASE:-on/);
  const after = code.slice(afterStart);
  assert.match(after, /node "\$SCRIPT_DIR\/checks\/run\.mjs" --json "\$CHECKS_JSON"/);
  assert.match(after, /release_outcome_report "\$TARGET" "\$RELEASE_COMMIT_MSG" "\$RELEASE_SHA"/);
  assert.match(after, /MATRX_REPO_ROOT="\$REPO_ROOT" uv run --frozen python "\$DISPATCHER" --findings "\$CHECKS_JSON"/);
  assert.match(after, /\nexit 0\n$/);
});

test("every run is captured to a dated log file", () => {
  assert.match(code, /RELEASE_LOG_FILE="\$RELEASE_LOG_DIR\/release-\$\{RELEASE_LOG_STAMP\}\.log"/);
  assert.match(code, /"\$0" "\$@" 2>&1 \| tee -a "\$RELEASE_LOG_FILE"/);
});
