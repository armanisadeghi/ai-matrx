/**
 * 🚨 A COMMAND THAT RUNS NOWHERE IS NOT A RELEASE STEP.
 *
 * aidream's notification spine asks `platform.route_manifest` whether a route
 * can answer a link BEFORE it puts that link in a text message
 * (`aidream/services/routes/liveness.py`). `lib/route-manifest/generate.ts` is
 * the only author of that truth, and its own header says the lockfile is
 * "synced to platform.route_manifest by the deploy that changes the routes".
 *
 * It was not. `pnpm route-manifest:sync` existed from the day the manifest did
 * and ran NOWHERE — not in `release.sh`, not in CI, not in any workflow. On
 * 2026-09-21 the live table was 1164 routes and 05:09 UTC old while the repo's
 * lockfile held 1228 including `{"pattern":"/q/[token]","status":"live"}`. So
 * every Personal Staff quick-action text was skipped with
 * `deep_link_not_live` against a route that had been serving for days — the
 * link-honesty gate doing its job perfectly against a lie it had been told.
 *
 * `scripts/run-release-gates.sh` even carried a comment saying the sync is
 * "written by ONE command a human has to remember, which runs nowhere
 * automatically". A documented gap is still a gap: this test is what makes the
 * sentence in `generate.ts` true.
 *
 * WHAT WOULD MAKE THIS GO RED: deleting the publish, moving it off the
 * green-rollout path (publishing before the build is serving claims a route
 * answers while it still 404s — the same defect pointed the other way), or
 * dropping the npm script it calls.
 *
 *   node --test scripts/release-publishes-the-route-manifest.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SCRIPTS, "..");
const RELEASE = readFileSync(path.join(SCRIPTS, "release.sh"), "utf8");
const PACKAGE = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8"));

function shellFunction(name) {
  const match = RELEASE.match(new RegExp(`${name}\\(\\) \\{([\\s\\S]*?)^\\}`, "m"));
  assert.ok(match, `scripts/release.sh no longer defines ${name}`);
  return match[1];
}

test("the release path publishes the route manifest", () => {
  assert.match(
    RELEASE,
    /after_publish_route_manifest\(\)\s*\{/,
    "scripts/release.sh no longer defines the publish step. A route manifest " +
      "nothing publishes is a link nothing texts.",
  );
  assert.match(
    RELEASE,
    /pnpm -s route-manifest:sync/,
    "the publish step no longer runs `route-manifest:sync`",
  );
});

test("it publishes ONLY on a proven-green rollout", () => {
  // `release_outcome_report` returning 0 is the one statement that the build is
  // READY on every targeted project AND serving on the live domain. Publishing
  // anywhere else would tell the spine a route answers before it does.
  const greenBranch = RELEASE.match(/^\s*0\)\s*(.+)$/m);
  assert.ok(greenBranch, "release.sh no longer has a rollout rc==0 branch");
  assert.match(
    greenBranch[1],
    /after_publish_route_manifest/,
    "the publish is not on the green-rollout branch: " + greenBranch[1],
  );

  const publish = shellFunction("after_publish_route_manifest");
  assert.match(
    publish,
    /ROUTE_MANIFEST_SOURCE_SHA="\$RELEASE_SHA" pnpm -s route-manifest:sync/,
    "the post-READY sync no longer stamps the exact release SHA",
  );

  // The command-like remediation text below must not be mistaken for an
  // executable sync. One shell invocation, in this function, prevents a
  // premature manifest claim before the rollout has been proven READY.
  const executableSyncs = RELEASE.match(/pnpm -s route-manifest:sync/g) ?? [];
  assert.equal(executableSyncs.length, 1, "the sync has an additional executable release path");
  assert.match(publish, /pnpm -s route-manifest:sync/);
  assert.equal(
    (RELEASE.match(/\bafter_publish_route_manifest\b/g) ?? []).length,
    2,
    "the manifest publish function is called outside its single post-READY branch",
  );
});

test("a release that cannot prove the rollout says the manifest is stale", () => {
  // --no-watch proves nothing, so it may not publish — and silence there is how
  // a stale manifest survives a release unnoticed.
  assert.match(
    RELEASE,
    /ship_finding "WARNING" "Route manifest" "UNPUBLISHED/,
    "--no-watch no longer reports that the manifest was left stale",
  );
  assert.match(
    RELEASE,
    /ship_finding "ERROR" "Route manifest" \\\n\s*"UNPUBLISHED/,
    "a failed publish no longer produces an ERROR finding",
  );
});

test("POSITIVE CONTROL — the npm scripts the release leans on exist", () => {
  assert.equal(
    PACKAGE.scripts["route-manifest:sync"],
    "tsx scripts/sync-route-manifest.ts",
    "route-manifest:sync moved or changed; the release step calls it by name",
  );
  // The check that screams when the live set and the repo set disagree. It is
  // the other half: this test proves the release WRITES, that one proves the
  // result is RIGHT.
  assert.ok(
    PACKAGE.scripts["check:route-manifest:live"],
    "check:route-manifest:live is gone; nothing would notice a stale manifest",
  );
});
