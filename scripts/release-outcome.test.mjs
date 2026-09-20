// release-outcome.test.mjs — THE RELEASE-BANNER TRUTH LAW, at the wiring seam.
//
// The behavioural guard is scripts/release-outcome.sh --self-test: it executes
// the real old banner from release.sh@e30f034c9f over an ERRORed deployment
// record (RED — green printed), then drives the new release_outcome_report
// through READY / ERROR / CANCELED / ignored / timeout / not-promoted /
// no-credential and proves green appears for exactly one of them.
//
// This file guards the OTHER half: that release.sh actually consults it, and
// that the unconditional green box never comes back. Both halves run in the
// repo's script tests; the .sh self-test also runs inside every real release.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseScript = await readFile(new URL("./release.sh", import.meta.url), "utf8");
const outcomeScript = await readFile(new URL("./release-outcome.sh", import.meta.url), "utf8");

test("release.sh no longer prints an unconditional green 'Released' box", () => {
  // The defect, verbatim from e30f034c9f: `echo -e "${GREEN}  Released ...`
  // emitted the line after `git push` returned 0.
  assert.doesNotMatch(releaseScript, /echo -e "\$\{GREEN\}\s+Released /);
});

test("release.sh consults the outcome primitive in the after phase, never before the push", () => {
  const code = releaseScript.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const pushAt = code.indexOf('ship_mark "pushed ${RELEASE_SHA:0:9}');
  assert.ok(pushAt > 0);
  assert.doesNotMatch(code.slice(0, pushAt).replace(/"(?:[^"\\]|\\.)*"/g, '""'), /release-outcome\.sh/);
  assert.match(code.slice(pushAt), /source "\$SCRIPT_DIR\/release-outcome\.sh"/);
  assert.match(code.slice(pushAt), /release_outcome_report "\$TARGET" "\$RELEASE_COMMIT_MSG" "\$RELEASE_SHA"/);
});

test("a dead rollout is an ERROR finding the fixer dispatcher sees, and a missing credential is a WARNING", () => {
  // The push already happened and Vercel is building: the verdict cannot be an
  // exit code anyone reads (the after phase is detached). It is a finding row
  // in findings-vX.Y.Z.jsonl, dispatched like every other finding.
  assert.match(releaseScript, /ship_finding "ERROR" "Rollout" "ROLLOUT FAILED: \$\{NEW_TAG\}/);
  assert.match(releaseScript, /ship_finding "WARNING" "Rollout" "UNVERIFIED — \$\{NEW_TAG\}/);
});

test("the outcome gate cannot be silently skipped", () => {
  // --no-watch is allowed, but it must record UNWATCHED and never claim success.
  assert.match(releaseScript, /ship_finding "WARNING" "Rollout" "UNWATCHED — \$\{NEW_TAG\} was pushed with --no-watch; nothing here claims it is live"/);
});

test("green requires READY and the live domain serving that deployment", () => {
  assert.match(outcomeScript, /Released and LIVE/);
  assert.match(outcomeScript, /release_outcome_await_serving/);
  // The one green box is emitted only after the dead/unverified branches returned.
  const greenAt = outcomeScript.indexOf('glines=("Released and LIVE');
  const deadAt = outcomeScript.indexOf('lines=("ROLLOUT FAILED');
  const unverifiedAt = outcomeScript.indexOf('"UNVERIFIED — the push landed');
  assert.ok(deadAt !== -1 && unverifiedAt !== -1 && greenAt !== -1);
  assert.ok(deadAt < greenAt, "the dead-rollout branch must return before green");
  assert.ok(unverifiedAt < greenAt, "the unverified branch must return before green");
});

test("the skip check runs the real ignore script, not a copy of its rules", () => {
  assert.match(outcomeScript, /bash "\$\(_release_outcome_dir\)\/vercel-ignore-build\.sh"/);
  // No second implementation of the prefix table.
  assert.doesNotMatch(outcomeScript, /release-admin:\*\)/);
});

test("no auth is invented: env token, else the Vercel CLI's own auth.json", () => {
  assert.match(outcomeScript, /VERCEL_TOKEN/);
  assert.match(outcomeScript, /com\.vercel\.cli\/auth\.json/);
  // A missing credential is UNVERIFIED (rc 2), never a green claim.
  assert.match(outcomeScript, /NO_TOKEN\\t\\t/);
});

test("the wait announces itself and states its wall", () => {
  assert.match(outcomeScript, /waiting for Vercel: \$\{project_name\} \$\{state\} \$\{elapsed\}s \(wall \$\{wall\}s\)/);
  assert.match(outcomeScript, /up to \$\(\(wall \/ 60\)\) min, polling every \$\{poll\}s/);
});

test("the behavioural self-test passes (RED baseline reproduced, then gated)", () => {
  const out = execFileSync("bash", [new URL("./release-outcome.sh", import.meta.url).pathname, "--self-test"], {
    encoding: "utf8",
  });
  assert.match(out, /RED reproduced: release\.sh@\w+ prints 'Released/);
  assert.match(out, /release-outcome self-test: all checks passed/);
});
