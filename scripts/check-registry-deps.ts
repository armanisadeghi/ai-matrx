#!/usr/bin/env tsx
/**
 * Registry-only dependency guard — every dependency must resolve from the npm
 * registry, never from raw GitHub or an arbitrary tarball.
 *
 * A `github:`/`git:`/`https:` spec makes `pnpm install --frozen-lockfile` reach
 * codeload.github.com, so the repo becomes uninstallable in any environment whose
 * egress allows the registry but not raw GitHub — sandboxed CI, locked-down corp
 * networks, and cloud agent sessions. It is also a supply-chain hazard: a spec with
 * no ref floats to whatever the third party's default branch happens to be.
 *
 * This repo hit exactly that with `"@uidotdev/usehooks": "github:uidotdev/usehooks"`.
 * It is now vendored in hooks/usehooks/. Do not reintroduce the pattern — publish to
 * the registry or vendor the code.
 *
 * Modes:
 *   pnpm check:registry-deps          report offenders
 *   pnpm check:registry-deps --strict exit 1 when offenders found
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Spec prefixes that resolve to something other than the npm registry. */
const NON_REGISTRY_PREFIXES = [
  "github:",
  "gitlab:",
  "bitbucket:",
  "git:",
  "git+ssh:",
  "git+https:",
  "http://",
  "https://",
] as const;

const MANIFEST_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "resolutions",
  "overrides",
] as const;

interface Violation {
  where: string;
  detail: string;
}

function parseArgs(): { strict: boolean } {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log("Usage: check-registry-deps [--strict]");
    process.exit(0);
  }
  return { strict: process.argv.includes("--strict") };
}

function checkManifest(): Violation[] {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const violations: Violation[] = [];

  for (const section of MANIFEST_SECTIONS) {
    const entries = manifest[section];
    if (typeof entries !== "object" || entries === null) continue;
    for (const [name, spec] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof spec !== "string") continue;
      if (NON_REGISTRY_PREFIXES.some((prefix) => spec.startsWith(prefix))) {
        violations.push({
          where: `package.json → ${section}`,
          detail: `"${name}": "${spec}"`,
        });
      }
    }
  }
  return violations;
}

function checkLockfile(): Violation[] {
  const lock = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");
  const violations: Violation[] = [];

  lock.split("\n").forEach((line, index) => {
    // `deprecated:` values legitimately carry GitHub URLs in their message text.
    if (/^\s*deprecated:/.test(line)) return;
    if (/\{tarball:\s*http/.test(line) || /resolution:\s*\{\s*(type:\s*git|repo:)/.test(line)) {
      violations.push({
        where: `pnpm-lock.yaml:${index + 1}`,
        detail: line.trim(),
      });
    }
  });
  return violations;
}

function main(): void {
  const { strict } = parseArgs();
  const violations = [...checkManifest(), ...checkLockfile()];

  if (violations.length === 0) {
    console.log("[OK] All dependencies resolve from the npm registry.");
    return;
  }

  console.error(
    `[FAIL] ${violations.length} non-registry dependency source(s) found.\n` +
      "These make the repo uninstallable wherever raw GitHub is blocked.\n",
  );
  for (const violation of violations) {
    console.error(`  ${violation.where}\n    ${violation.detail}`);
  }
  console.error("\nFix: use the registry version, or vendor the code (see hooks/usehooks/).");

  if (strict) process.exit(1);
}

main();
