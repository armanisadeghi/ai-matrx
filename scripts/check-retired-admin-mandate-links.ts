#!/usr/bin/env npx tsx
/**
 * NOTHING LINKS TO THE RETIRED ADMIN MANDATE PAGES.
 *
 * The original admin mandate pages at `/administration/mandates/**` (the
 * console, its record page, new, advanced, references) were retired into
 * Intelligence → Mandates, `/administration/intelligence/mandates/**`
 * (Arman approved the swap, 2026-09-27). The old addresses only redirect
 * (next.config.js). Every href to an admin mandate page is built in
 * `features/mandates/admin-routes.ts`.
 *
 * This fails when shipped source names the retired address again — a link,
 * a push, a template, a string, or a comment pointing someone there — or
 * imports one of the removed pieces. Tests are skipped (a redirect test must
 * name the old address); next.config.js is outside the scanned trees.
 *
 *   pnpm check:retired-admin-mandate-links
 *   pnpm check:retired-admin-mandate-links --root <dir>   # scan another tree
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RETIRED = [
  {
    pattern: /\/administration\/mandates(?=$|[\/?#"'`\s)\]}.,;:])/,
    why: "names a retired admin mandate address — build it with features/mandates/admin-routes.ts",
  },
  {
    pattern: /\b(MandatesConsole|AdminMandateWorkspacePage|MandateCoverageBoard|CLASSIC_ADMIN_MANDATES)\b/,
    why: "names a removed piece of the retired admin mandate pages",
  },
];

const SCANNED_DIRS = ["app", "features", "../aidream/apps/shared/chat/src", "lib", "components", "hooks", "utils", "providers", "scripts"];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIPPED = /(^|\/)(node_modules|\.next[^/]*|__tests__)(\/|$)|\.test\.[jt]sx?$|\.spec\.[jt]sx?$/;
const SELF = "scripts/check-retired-admin-mandate-links.ts";

function walk(root: string, dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const rel = relative(root, full);
    if (SKIPPED.test(rel)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) walk(root, full, out);
    else if (EXTENSIONS.test(name) && rel !== SELF) out.push(rel);
  }
}

export function findRetiredMandateLinks(root: string): string[] {
  const files: string[] = [];
  for (const dir of SCANNED_DIRS) walk(root, join(root, dir), files);
  const problems: string[] = [];
  for (const file of files) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const { pattern, why } of RETIRED) {
        if (pattern.test(line)) {
          problems.push(`${file}:${index + 1}: ${line.trim().slice(0, 140)} — ${why}`);
        }
      }
    });
  }
  return problems;
}

function main(): void {
  const rootFlag = process.argv.indexOf("--root");
  const root = rootFlag > -1 ? process.argv[rootFlag + 1] : process.cwd();
  const problems = findRetiredMandateLinks(root);
  if (problems.length > 0) {
    console.error(
      `✗ ${problems.length} reference(s) to the retired admin mandate pages:\n  ${problems.join("\n  ")}\n\n` +
        "Point it at /administration/intelligence/mandates/** through features/mandates/admin-routes.ts.",
    );
    process.exit(1);
  }
  console.log("✓ nothing links to the retired admin mandate pages");
}

main();
