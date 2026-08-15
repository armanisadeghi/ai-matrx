#!/usr/bin/env tsx
/**
 * check-shared-skills — are this repo's CROSS-REPO skills still byte-identical
 * to their canonical bodies in common-docs?
 *
 * A cross-repo skill (handoffs, handoff-cleanup, cross-repo-docs) is
 * DELIBERATELY mirrored into every repo as a real committed file: an agent's
 * harness only sees skills physically present under `.claude/skills/`, and
 * agents routinely run in a sandbox that checked out one repo, where a symlink
 * or a "read the canonical at /Users/…" stub silently resolves to nothing.
 * The cost of that decision is drift, so this is the guard that catches it.
 *
 * Thin wrapper: common-docs owns the sync + comparison
 * (`meta/scripts/sync_skills.py --check`). Loud, NEVER blocking — and when the
 * bundle is not checked out it SCREAMS and passes rather than failing a release
 * for a missing sibling repo.
 *
 * Fix drift: edit `common-docs/skills/<name>/SKILL.md`, run
 * `python3 common-docs/meta/scripts/sync_skills.py`, commit each repo.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const BUNDLE =
  process.env.MATRX_COMMON_DOCS ??
  path.resolve(process.cwd(), "..", "common-docs");
const script = path.join(BUNDLE, "meta", "scripts", "sync_skills.py");

if (!existsSync(script)) {
  console.warn(
    `\n⚠️  shared-skills check SKIPPED — common-docs not found at ${BUNDLE}.\n` +
      "   This repo's cross-repo skills could be stale and nothing here can tell.\n" +
      "   Clone it as a sibling: git clone https://github.com/AI-Matrix-Engine/matrx-common-docs.git ../common-docs\n",
  );
  process.exit(0);
}

const result = spawnSync("python3", [script, "--check"], { stdio: "inherit" });
if (result.status !== 0) {
  console.warn(
    "\n⚠️  Cross-repo skills have DRIFTED from their canonical bodies (advisory, not blocking).\n" +
      "   Fix: edit common-docs/skills/<name>/SKILL.md → " +
      "python3 common-docs/meta/scripts/sync_skills.py → commit each repo.\n",
  );
}
// Advisory by design (repo doctrine: scream, never block a release).
process.exit(0);
