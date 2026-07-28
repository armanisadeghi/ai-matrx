#!/usr/bin/env tsx
/**
 * check-docs-guards.ts — Wave 5 doc-jungle prevention guards (advisory).
 *
 * Three checks over git-tracked *.md files (docs/archive/, node_modules/,
 * agent-instruction dirs excluded):
 *
 *  1. Confident-title check — no doc may claim SOURCE OF TRUTH / CANONICAL /
 *     OFFICIAL / SSOT in its H1 or first 10 lines unless it is a legitimate
 *     claimant. Pointer stubs to common-docs are auto-allowed (they point at
 *     authority, they don't claim it). Everything else must appear in
 *     scripts/docs-guards/confident-title-allowlist.txt (additions via PR).
 *
 *  2. Root-.md ban — no new git-tracked *.md at the repo root outside the
 *     sanctioned list below.
 *
 *  3. Pointer-path lint — common-docs pointers must use the restructured
 *     layout (systems|projects|policies|meta|skills) and the canonical
 *     spelling `/Users/armanisadeghi/code/common-docs/...` (the
 *     `/Volumes/...` and `matrx-common-docs` spellings only resolve on one
 *     machine).
 *
 * ADVISORY: prints a loud report and exits 1 when violations exist, but it is
 * wired only into the advisory release-gates pass — it never blocks ship/push.
 * Campaign doc: docs/handoffs/doc-consolidation-campaign.md (Wave 5).
 *
 * Usage: pnpm check:docs-guards
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ALLOWLIST_PATH = join(
  ROOT,
  "scripts/docs-guards/confident-title-allowlist.txt",
);

// Dirs that are agent-instruction / owner territory, not knowledge docs —
// skills and Arman's own notes are governed separately from the doc jungle.
const SCAN_EXCLUDE = /^(docs\/archive\/|node_modules\/|\.venv\/|\.claude\/|\.agents\/|\.arman\/|\.cursor\/|\.matrx\/)/;

const CONFIDENT = /source of truth|canonical|official truth|SSOT|official rules/i;

const SANCTIONED_ROOT_MD = new Set([
  "CLAUDE.md",
  "AGENTS.md",
  "PRINCIPLES.md",
  "TYPESCRIPT_STANDARDS.md",
  "FOUND_DEFECTS.md",
  "CURRENT_ERRORS.md",
  "README.md",
]);

const COMMON_DOCS_ALLOWED_DIRS = new Set([
  "systems",
  "projects",
  "policies",
  "meta",
  "skills",
]);

function trackedMd(): string[] {
  return execSync("git ls-files -z -- '*.md'", { encoding: "utf8" })
    .split("\0")
    .filter((f) => f && !SCAN_EXCLUDE.test(f));
}

interface AllowRule {
  kind: "exact" | "prefix" | "basename";
  value: string;
}

function loadAllowlist(): AllowRule[] {
  if (!existsSync(ALLOWLIST_PATH)) return [];
  return readFileSync(ALLOWLIST_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l): AllowRule => {
      if (l.startsWith("basename:")) {
        return { kind: "basename", value: l.slice("basename:".length) };
      }
      if (l.endsWith("/")) return { kind: "prefix", value: l };
      return { kind: "exact", value: l };
    });
}

function isAllowed(file: string, rules: AllowRule[]): boolean {
  const base = file.split("/").pop() ?? file;
  return rules.some((r) =>
    r.kind === "exact"
      ? file === r.value
      : r.kind === "prefix"
        ? file.startsWith(r.value)
        : base === r.value,
  );
}

const allowRules = loadAllowlist();
const files = trackedMd();

// ── 1. Confident-title check ────────────────────────────────────────────────
const confidentViolations: { file: string; phrase: string }[] = [];
for (const file of files) {
  let head: string;
  try {
    head = readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .slice(0, 10)
      .join("\n");
  } catch {
    continue;
  }
  // Code identifiers can legitimately contain reserved prose (for example,
  // `CanonicalBlockIR` or `canonical-vs-final`) without claiming doc authority.
  const authorityProse = head.replace(/`[^`]*`/g, "");
  const m = authorityProse.match(CONFIDENT);
  if (!m) continue;
  // Pointer stubs point AT authority (common-docs); they don't claim it.
  if (head.includes("common-docs/")) continue;
  if (isAllowed(file, allowRules)) continue;
  confidentViolations.push({ file, phrase: m[0] });
}

// ── 2. Root-.md ban ─────────────────────────────────────────────────────────
const rootViolations = files.filter(
  (f) => !f.includes("/") && !SANCTIONED_ROOT_MD.has(f),
);

// ── 3. Pointer-path lint ────────────────────────────────────────────────────
const pointerViolations: { file: string; line: number; text: string }[] = [];
const STALE_DIR = /common-docs\/([A-Za-z0-9._-]+)\//g;
// `matrx-common-docs/` only as a path segment — prose mentions of the repo
// name (e.g. "pushed to matrx-common-docs") are not pointer drift.
const BAD_SPELLING = /\/Volumes\/Samsung2TB\/code\/common-docs|matrx-common-docs\//;
for (const file of files) {
  let lines: string[];
  try {
    lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  } catch {
    continue;
  }
  lines.forEach((text, i) => {
    let bad = BAD_SPELLING.test(text);
    if (!bad) {
      for (const m of text.matchAll(STALE_DIR)) {
        if (!COMMON_DOCS_ALLOWED_DIRS.has(m[1])) {
          bad = true;
          break;
        }
      }
    }
    if (bad) {
      pointerViolations.push({ file, line: i + 1, text: text.trim().slice(0, 160) });
    }
  });
}

// ── Report ──────────────────────────────────────────────────────────────────
const total =
  confidentViolations.length + rootViolations.length + pointerViolations.length;

if (total === 0) {
  console.log("docs-guards: OK — no confident-title, root-.md, or pointer-path violations.");
  process.exit(0);
}

console.log("");
console.log("============================================================");
console.log("  [FAIL] DOCS GUARDS — doc-jungle prevention violations");
console.log("============================================================");

if (confidentViolations.length) {
  console.log("");
  console.log(`-- Confident-title claims (${confidentViolations.length}) --`);
  console.log("   No doc may claim SOURCE OF TRUTH / CANONICAL / OFFICIAL / SSOT unless");
  console.log("   it is the sanctioned truth. Either demote the claim or add the file to");
  console.log("   scripts/docs-guards/confident-title-allowlist.txt via PR.");
  for (const v of confidentViolations) {
    console.log(`   ${v.file}  (matched: "${v.phrase}")`);
  }
}

if (rootViolations.length) {
  console.log("");
  console.log(`-- Root-level .md outside the sanctioned list (${rootViolations.length}) --`);
  console.log(`   Sanctioned: ${[...SANCTIONED_ROOT_MD].join(", ")}`);
  console.log("   Move the file into docs/ (or archive it); the repo root is not a doc dump.");
  for (const f of rootViolations) console.log(`   ${f}`);
}

if (pointerViolations.length) {
  console.log("");
  console.log(`-- Stale / non-canonical common-docs pointers (${pointerViolations.length}) --`);
  console.log("   Canonical spelling: /Users/armanisadeghi/code/common-docs/<systems|projects|policies|meta|skills>/...");
  for (const v of pointerViolations) {
    console.log(`   ${v.file}:${v.line}  ${v.text}`);
  }
}

console.log("");
console.log(`${total} error(s). Advisory — fix or allowlist via PR; see docs/handoffs/doc-consolidation-campaign.md (Wave 5).`);
process.exit(1);
