// What the repo-only CI job must GIVE its checks before they can judge.
//
// On the first production ingest (2026-09-30) nine rows reported failure without measuring
// anything, because the job did not hold what they read — not because the code was wrong
// (common-docs/systems/architecture/observability/projects/checks-run-in-the-app/PLAN.md § Broken checks):
//
//   * a depth-1 checkout → `check:self-tests-stay-out-of-tree --self-test` cannot read a guard's
//     pre-fix copy at `<sha>^` ("fatal: invalid object name"), and `patrol:delivery:check` finds
//     no version tag that is an ancestor of the release head;
//   * no matrx-local checkout → `check:honest-states-parity` and its self-test cannot read the
//     engine artifact, so the browser/engine sentence parity is UNMEASURED;
//   * no Chromium → `check:shell-layout` cannot launch a browser, so shipped CSS is UNMEASURED.
//
// Each of those is honest about not measuring, and the page now shows it as a broken check with
// that reason. This test keeps the job from losing what it takes to measure them at all.
// (aidream is PRIVATE and this workflow is PUBLIC and holds no secret, so the rows that read an
// aidream checkout stay UNMEASURED here by design — they are measured in aidream's own job.)
//
// Run: node --test scripts/checks/ci-environment.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflow = readFileSync(join(ROOT, ".github", "workflows", "repo-only-checks.yml"), "utf8");

test("the job checks out the whole history: a self-test replays a guard's pre-fix copy from git", () => {
  assert.match(workflow, /fetch-depth:\s*0/, "actions/checkout must take fetch-depth: 0");
});

test("the job holds the matrx-local engine contracts the honest-state parity guard reads", () => {
  assert.match(workflow, /matrx-local/, "clone matrx-local (public) beside this repo");
  assert.match(workflow, /sparse-checkout set crates\/matrx-sync\/contracts/);
});

test("the job installs the browser the real-browser rows measure in", () => {
  assert.match(workflow, /playwright install .*chromium/);
});

test("the public job still references no secret", () => {
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./, "this repository is public — no secret here");
});
