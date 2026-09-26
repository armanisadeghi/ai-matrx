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
// Everything from the first line of the script to the push: flag parsing and
// the --ship commit too, not just the ship block.
const everythingBeforePush = code.slice(0, pushAt);
const afterPush = code.slice(pushAt, afterStart);
// A remedy string may NAME a check ("pnpm check:migrations:strict"); only an unquoted token RUNS one.
const unquoted = (text) => text.replace(/"(?:[^"\\]|\\.)*"/g, '""');

test("nothing but the fetch and the push can stop a release", () => {
  const fails = [...everythingBeforePush.matchAll(/\bfail "([^"]*)"/g)].map((m) => m[1]);
  for (const message of fails) {
    assert.match(
      message,
      /Cannot reach GitHub|assemble the release commit|Could not read the version|Could not write version|Could not assemble the release commit|Lost the push race|Cannot push to GitHub|\$VERSION_FILE not found/,
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

test("the push never waits for migrations: they are awaited only after it lands", () => {
  // af0d8c1934 moved this wait behind the push; 95dc1a2637 silently put it back
  // in front, delaying every build by the whole migration pass (70s on v0.4.2269).
  assert.doesNotMatch(beforePush, /wait "\$SHIP_MIG_PID"/);
  assert.match(afterPush, /wait "\$SHIP_MIG_PID"/);
});

test("the lock covers only the bump and the push: released before the migration wait, stolen after 30s", () => {
  const release = afterPush.indexOf("release_lock_cleanup; RELEASE_LOCK_HELD=false");
  const migWait = afterPush.indexOf('wait "$SHIP_MIG_PID"');
  assert.ok(release > 0 && migWait > release, "the ship lock must be released before waiting on migrations");
  assert.match(code, /waited >= 30\b/);
  assert.match(code, /ship_finding "WARNING" "Git" "Release lock held/);
});

test("a bad flag, target or --ship pathspec is a WARNING, never a stop", () => {
  assert.doesNotMatch(everythingBeforePush, /release_stage_validate_paths[^\n]*\n[^\n]*\|\| fail/);
  assert.doesNotMatch(everythingBeforePush, /release_stage_commit[^\n]*\n[^\n]*\|\| fail/);
  assert.doesNotMatch(unquoted(everythingBeforePush), /release-stage\.sh" --self-test/);
});

test("a failed migration, a conflicting local commit and a lost tag are findings, never stops", () => {
  // Each held migration is NAMED with its reason; a dead applier is one ERROR with its exit code.
  assert.match(afterPush, /ship_migration_findings "\$SHIP_MIG_STATUS"/);
  assert.match(code, /ERROR\|\$\{short\(h\.file\)\} was not applied: /);
  assert.match(code, /The migration tool stopped \(exit \$\{status\}\) before it could say which file/);
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

test("findings print one section per category, opened and closed", () => {
  assert.match(code, /echo "\$bar \$cat \$bar"/);
  assert.match(code, /echo "\$bar End of \$cat \$bar"/);
});

test("the clean run prints exactly the ship line; INFO never prints", () => {
  // The seconds are measured at the push, not after the migration wait.
  assert.match(afterPush, /SHIP_BUILD_SECONDS=\$\(\(SECONDS - SHIP_START\)\)/);
  assert.match(afterPush, /echo "\$\{NEW_TAG\}  pushed, build started  \(\$\{SHIP_BUILD_SECONDS\}s\)"/);
  assert.doesNotMatch(code, /^\s*info\b/m);
  assert.doesNotMatch(code, /\[INFO\]/);
});

test("everything else runs after the build started, detached, into the log", () => {
  assert.match(afterPush, /nohup "\$0" \$\{RELEASE_ORIGINAL_ARGS\[@\]\+"\$\{RELEASE_ORIGINAL_ARGS\[@\]\}"\} <\/dev\/null >>"\$\{RELEASE_LOG_FILE:-\/dev\/null\}" 2>&1 &/);
  assert.match(afterPush, /RELEASE_AFTER_PHASE:-on/);
  const after = code.slice(afterStart);
  assert.match(after, /node "\$SCRIPT_DIR\/checks\/run\.mjs" --skip-live-db --json "\$CHECKS_JSON"/);
  // Nothing that can open the live database runs 50-90 times a day (Arman, 2026-09-25): every
  // invocation of the runner in the after phase carries --skip-live-db.
  const runs = after.match(/node "\$SCRIPT_DIR\/checks\/run\.mjs"[^\n]*/g) ?? [];
  assert.ok(runs.length > 0 && runs.every((line) => line.includes("--skip-live-db")), `a runner call without --skip-live-db: ${runs.join(" | ")}`);
  assert.match(after, /release_outcome_report "\$TARGET" "\$RELEASE_COMMIT_MSG" "\$RELEASE_SHA"/);
  assert.match(after, /MATRX_REPO_ROOT="\$REPO_ROOT" uv run --frozen python "\$DISPATCHER" --findings "\$CHECKS_JSON"/);
  assert.match(after, /\nexit 0\n$/);
});

test("every run is captured to a dated log file", () => {
  assert.match(code, /RELEASE_LOG_FILE="\$RELEASE_LOG_DIR\/release-\$\{RELEASE_LOG_STAMP\}\.log"/);
  assert.match(code, /"\$0" "\$@" 2>&1 \| tee -a "\$RELEASE_LOG_FILE"/);
});
