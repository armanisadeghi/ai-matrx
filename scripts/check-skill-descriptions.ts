#!/usr/bin/env tsx
/**
 * check-skill-descriptions — do this repo's LOCAL skills carry descriptions the
 * harness will actually show?
 *
 * Claude Code truncates a skill description at 1,536 chars and budget-caps the
 * whole skill listing; past the cap, skills arrive name-only and never
 * auto-trigger. House rule (common-docs/skills/skill-authoring/SKILL.md §1):
 * noun phrase + `Use when …`, target ≤300 chars, fail >500 unless allowlisted,
 * fail >1,024.
 *
 * Thin wrapper: common-docs owns the lint and its ratcheting allowlist
 * (`meta/scripts/skill_descriptions.py lint --repo`). Synced copies are linted
 * at their canonical, not here. When the bundle is not checked out it SCREAMS
 * and passes rather than failing a release for a missing sibling repo.
 *
 * Usage: pnpm check:skill-descriptions  |  pnpm check:skill-descriptions:self-test
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const BUNDLE =
  process.env.MATRX_COMMON_DOCS ??
  path.resolve(process.cwd(), "..", "common-docs");
const script = path.join(BUNDLE, "meta", "scripts", "skill_descriptions.py");

if (!existsSync(script)) {
  console.warn(
    `\n⚠️  skill-descriptions check SKIPPED — common-docs not found at ${BUNDLE}.\n` +
      "   This repo's skill descriptions could be over budget and nothing here can tell.\n" +
      "   Clone it as a sibling: git clone https://github.com/AI-Matrix-Engine/matrx-common-docs.git ../common-docs\n",
  );
  process.exit(0);
}

const args = process.argv.includes("--self-test")
  ? ["lint", "--self-test"]
  : ["lint", "--repo", process.cwd()];
const result = spawnSync("python3", [script, ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
