#!/usr/bin/env tsx
/**
 * Access guard check — the enforcement piece of THE SECURITY PHILOSOPHY and
 * THE VIEW LAW (CLAUDE.md §Supabase, common-docs/systems/db-rules/FEATURE.md §6).
 *
 * The philosophy: real security = the right people get in without blinking AND
 * the wrong people can't get in at all. Over-tightening is a defect, not caution.
 * Three absolutes this check enforces mechanically where it can:
 *
 *   1. New work never defaults a row to the lowest visibility tier ('personal')
 *      without a human sign-off comment — 'personal' means "belongs to an
 *      individual person" (chats/DMs), almost nothing else. A silent default
 *      to the tightest tier is how legitimate org users get locked out.
 *   2. Access decisions NEVER key off the active/selected organization — only
 *      off the user. Gating a permission check on "current active org" means
 *      switching orgs in the sidebar silently changes what you can reach,
 *      which is both a security bug and a support nightmare.
 *   3. There is ONE permission ladder (utils/permissions/**), never a
 *      hand-rolled rank map or string-compare copy of it elsewhere.
 *   4. Every list-shaped Supabase read is scoped (owner/org/container) per
 *      THE VIEW LAW, or explicitly marked `// VIEW LAW:` when scope is
 *      established by wrapping logic the chain itself doesn't show.
 *
 * All four detectors are ADVISORY (loud, non-blocking) by default; nothing
 * runs this at commit time — a human or agent runs it via `pnpm check:access-guards`
 * or as part of `pnpm check:release-gates`. `--strict` exits 1 on any finding.
 *
 * Allowlist: scripts/access-guards/allowlist.json (see scripts/access-guards/FEATURE.md
 * for the shape and the bar for adding an entry — every entry needs a justification).
 *
 * Exit codes: 0 clean (or findings without --strict) · 1 findings + --strict · 2 script error
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ─── Allowlist ───────────────────────────────────────────────────────────────

interface AllowEntry {
  file: string;
  line?: number;
  justification: string;
  addedBy?: string;
  date?: string;
}

interface Allowlist {
  lowestTierDefault: AllowEntry[];
  activeOrgAccess: AllowEntry[];
  handRolledLadder: AllowEntry[];
  bareRlsList: AllowEntry[];
}

function loadAllowlist(): Allowlist {
  const p = join(ROOT, "scripts/access-guards/allowlist.json");
  if (!existsSync(p)) {
    return { lowestTierDefault: [], activeOrgAccess: [], handRolledLadder: [], bareRlsList: [] };
  }
  const raw = JSON.parse(readFileSync(p, "utf8"));
  return {
    lowestTierDefault: raw.lowestTierDefault ?? [],
    activeOrgAccess: raw.activeOrgAccess ?? [],
    handRolledLadder: raw.handRolledLadder ?? [],
    bareRlsList: raw.bareRlsList ?? [],
  };
}

function isAllowed(entries: AllowEntry[], file: string, line: number): boolean {
  return entries.some((e) => {
    if (e.file !== file) return false;
    if (e.line == null) return true; // file-level allow
    return Math.abs(e.line - line) <= 2;
  });
}

// ─── Repo file listing ──────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  "node_modules", ".next", ".next-preview", ".git", "dist", "build",
  "coverage", ".turbo", ".vercel",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function relPath(abs: string): string {
  return relative(ROOT, abs).split("\\").join("/");
}

// The checker's own source (regexes/selector-name lists) inevitably contains
// the literal patterns it's hunting for — self-matches are noise, not findings.
const SELF_FILE = "scripts/check-access-guards.ts";
// Generated files are not authored decisions; drift there is a codegen
// problem, not an access-guard violation.
const GENERATED_FILE_RE = /^types\/(database\.types|python-generated\/api-types)\.ts$/;

function isExemptFromAllDetectors(rel: string): boolean {
  return rel === SELF_FILE || GENERATED_FILE_RE.test(rel);
}

// Tracked-file check for detector 1 (migrations) — only tracked .sql matters.
function gitLsFiles(pattern: string): string[] {
  try {
    const raw = execSync(`git ls-files -- "${pattern}"`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return raw ? raw.split("\n") : [];
  } catch {
    return [];
  }
}

// ─── Findings ────────────────────────────────────────────────────────────────

type Severity = "FAIL" | "WARN";

interface Finding {
  detector: string;
  severity: Severity;
  file: string;
  line: number;
  rule: string;
  fix: string;
  snippet?: string;
}

const findings: Finding[] = [];

function pushFinding(f: Finding) {
  findings.push(f);
}

// ─── Detector 1: LOWEST-TIER DEFAULT ────────────────────────────────────────
//
// 'personal' is the tightest visibility tier. Silently defaulting new rows to
// it (rather than the deliberate 'internal'/'public' defaults THE SECURITY
// PHILOSOPHY calls for) locks out legitimate org users. A `personal-justified:`
// comment within 3 lines is the sign-off that this default is intentional.
// Historical migrations (pre-2026-07-21 rename) are exempt via allowlist by
// filename — see scripts/access-guards/allowlist.json `lowestTierDefault`.

const LOWEST_TIER_CUTOFF_DATE = "2026-07-21";
const LOWEST_TIER_RE = /default\s*[:=]?\s*'personal'|default_visibility.*'personal'/i;
const JUSTIFY_RE = /personal-justified\s*:/i;

function migrationDateFromFilename(file: string): string | null {
  // migrations/20260715_something.sql -> 2026-07-15
  const m = /(\d{4})(\d{2})(\d{2})/.exec(file);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function detectLowestTierDefault(allow: Allowlist) {
  const migrationFiles = gitLsFiles("migrations/*.sql").filter((f) => f.endsWith(".sql"));
  const codeFiles = walk(ROOT).filter((abs) => {
    const rel = relPath(abs);
    return (
      !rel.startsWith("migrations/") &&
      (rel.endsWith(".ts") || rel.endsWith(".tsx") || rel.endsWith(".sql")) &&
      !rel.startsWith("node_modules/")
    );
  }).map(relPath);

  const candidates = [...migrationFiles, ...codeFiles];

  for (const rel of candidates) {
    if (isExemptFromAllDetectors(rel)) continue;
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    // Historical-migration exemption: filename date before cutoff.
    if (rel.startsWith("migrations/")) {
      const date = migrationDateFromFilename(rel);
      if (date && date < LOWEST_TIER_CUTOFF_DATE) continue;
    }

    for (let i = 0; i < lines.length; i++) {
      if (!LOWEST_TIER_RE.test(lines[i])) continue;
      const lineNo = i + 1;
      const window = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join("\n");
      if (JUSTIFY_RE.test(window)) continue;
      if (isAllowed(allow.lowestTierDefault, rel, lineNo)) continue;

      pushFinding({
        detector: "LOWEST-TIER DEFAULT",
        severity: "FAIL",
        file: rel,
        line: lineNo,
        rule:
          "New row defaults to the 'personal' visibility tier — THE SECURITY PHILOSOPHY: " +
          "'personal' means belongs to an individual person (chats/DMs), almost nothing else; " +
          "org work defaults 'internal', scraped/derived data defaults 'public'.",
        fix:
          "If this default is deliberate, add a `personal-justified: <reason>` comment within 3 " +
          "lines. Otherwise change the default to 'internal' or 'public' per THE SECURITY PHILOSOPHY. " +
          "Pre-2026-07-21 migrations are auto-exempt; anything else needs an allowlist entry with justification.",
        snippet: lines[i].trim(),
      });
    }
  }
}

// ─── Detector 2: ACTIVE-ORG ACCESS ──────────────────────────────────────────
//
// Access NEVER depends on the active organization — checks key on the user.
// Heuristic (a): active-org selector imports inside utils/permissions/**,
// utils/auth/**, or any /access|permission|guard/i-named file.
// Heuristic (b): a `.eq("organization_id"` on what looks like a detail/
// update/delete query in the same function body as an active-org selector read.

const ACTIVE_ORG_SELECTORS = [
  "selectEffectiveOrganizationId",
  "selectActiveOrganizationId",
  "selectOrganizationId",
  "selectHasExplicitOrganization",
  "selectActiveOrganizationName",
];

const ACCESS_PATH_RE = /^(utils\/permissions\/|utils\/auth\/)/;
const ACCESS_NAME_RE = /access|permission|guard/i;

function isAccessDecisionFile(rel: string): boolean {
  if (ACCESS_PATH_RE.test(rel)) return true;
  const base = rel.split("/").pop() ?? "";
  return ACCESS_NAME_RE.test(base);
}

function detectActiveOrgAccess(allow: Allowlist) {
  const files = walk(ROOT)
    .map(relPath)
    .filter(
      (rel) =>
        (rel.endsWith(".ts") || rel.endsWith(".tsx")) &&
        !rel.includes("/__tests__/") &&
        !rel.endsWith(".test.ts") &&
        !rel.endsWith(".test.tsx") &&
        // the selector definitions themselves aren't findings
        rel !== "lib/redux/slices/appContextSlice.ts" &&
        rel !== "features/scopes/redux/selectors/active-context.ts"
    );

  const importRe = new RegExp(`\\b(${ACTIVE_ORG_SELECTORS.join("|")})\\b`);

  for (const rel of files) {
    if (isExemptFromAllDetectors(rel)) continue;
    if (!isAccessDecisionFile(rel)) continue;
    const abs = join(ROOT, rel);
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!importRe.test(content)) continue;

    const lines = content.split("\n");
    // (a) flag the import/usage itself inside an access-decision file.
    for (let i = 0; i < lines.length; i++) {
      const m = importRe.exec(lines[i]);
      if (!m) continue;
      const lineNo = i + 1;
      if (isAllowed(allow.activeOrgAccess, rel, lineNo)) continue;
      pushFinding({
        detector: "ACTIVE-ORG ACCESS",
        severity: "FAIL",
        file: rel,
        line: lineNo,
        rule:
          `Active-org selector '${m[1]}' referenced inside an access-decision file ` +
          `(${rel}). Access must key on the user, never on the currently-selected org.`,
        fix:
          "Remove the active-org read from the access decision, or gate on the user via " +
          "iam.has_access()/the permission resolver. If this read is provably not an access " +
          "decision (e.g. a UI label), add a justified allowlist entry.",
        snippet: lines[i].trim(),
      });
    }

    // (b) conservative: same function body has both an active-org selector
    // read AND a `.eq("organization_id"` on what reads like a detail/update/
    // delete query. We approximate "same function" with a small line window
    // and require the org selector to appear first.
    for (let i = 0; i < lines.length; i++) {
      if (!importRe.test(lines[i])) continue;
      const windowEnd = Math.min(lines.length, i + 25);
      for (let j = i + 1; j < windowEnd; j++) {
        if (/\.eq\(\s*["']organization_id["']/.test(lines[j])) {
          const lineNo = j + 1;
          if (isAllowed(allow.activeOrgAccess, rel, lineNo)) continue;
          pushFinding({
            detector: "ACTIVE-ORG ACCESS",
            severity: "WARN",
            file: rel,
            line: lineNo,
            rule:
              "Possible access-decision query scoped by organization_id in the same function " +
              "as an active-org selector read — gating a detail/update/delete on the active org " +
              "instead of the user's actual grants.",
            fix:
              "Confirm this is not gating access. If it is, replace with a user-keyed grant check " +
              "(iam.has_access / the permission resolver). If it's a legitimate org-scoped list " +
              "filter (not an access decision), add a justified allowlist entry.",
            snippet: lines[j].trim(),
          });
          break; // one WARN per org-selector occurrence is enough signal
        }
      }
    }
  }
}

// ─── Detector 3: HAND-ROLLED LADDER ─────────────────────────────────────────
//
// There is exactly one permission ladder. Files outside utils/permissions/**
// (the kernel) that define a rank map or manually compare permission_level
// strings are duplicating it — the classic two-competing-authorities bug.

const LADDER_ALLOWED_PREFIX = "utils/permissions/";
const RANK_MAP_RE = /LEVEL_RANK|permission_level\s*(>=|<=)|permission_level.*\.includes\(/;
const LADDER_SHAPE_RE = /['"]viewer['"][\s\S]{0,80}['"]editor['"][\s\S]{0,80}['"]admin['"]/i;

function detectHandRolledLadder(allow: Allowlist) {
  const files = walk(ROOT)
    .map(relPath)
    .filter(
      (rel) =>
        (rel.endsWith(".ts") || rel.endsWith(".tsx")) &&
        !rel.startsWith(LADDER_ALLOWED_PREFIX) &&
        !rel.includes("/__tests__/") &&
        !rel.endsWith(".test.ts") &&
        !rel.endsWith(".test.tsx")
    );

  for (const rel of files) {
    if (isExemptFromAllDetectors(rel)) continue;
    const abs = join(ROOT, rel);
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hitsRank = RANK_MAP_RE.test(line);
      const hitsShape = LADDER_SHAPE_RE.test(lines.slice(i, i + 3).join("\n"));
      if (!hitsRank && !hitsShape) continue;
      const lineNo = i + 1;
      if (isAllowed(allow.handRolledLadder, rel, lineNo)) continue;
      pushFinding({
        detector: "HAND-ROLLED LADDER",
        severity: hitsRank ? "FAIL" : "WARN",
        file: rel,
        line: lineNo,
        rule:
          "Permission-level rank map or manual viewer/editor/admin comparison outside " +
          "utils/permissions/** — a second, competing authority for the permission ladder.",
        fix:
          "Delete the local rank map/comparison; import the canonical ladder/resolver from " +
          "utils/permissions/**. If this is provably cosmetic (e.g. a display-only label, never " +
          "gating access), add a justified allowlist entry.",
        snippet: line.trim(),
      });
    }
  }
}

// ─── Detector 4: BARE-RLS LIST ───────────────────────────────────────────────
//
// THE VIEW LAW: a list-shaped Supabase read must carry an owner/org/container
// scope in the same chain, or an explicit `// VIEW LAW:` comment saying why
// it's exempt (e.g. genuinely public reference data). Single-record `.eq("id",
// ...)` / `.single()` reads are exempt — they're not "list" reads.

const VIEW_LAW_DIR_RE = /^features\/[^/]+\/(service|services|redux)\//;
const SCOPE_EQ_RE =
  /\.eq\(\s*["'](created_by|user_id|owner_id|owner|organization_id|org_id|project_id|task_id|conversation_id|scope_id|[a-z_]+_id)["']/;
const CONTAINS_IN_ID_RE = /\.in\(\s*["']id["']/;
const SINGLE_RECORD_RE = /\.eq\(\s*["']id["']|\.single\(\)/;
const VIEW_LAW_COMMENT_RE = /\/\/\s*VIEW LAW:/;
const APPLY_LIST_SCOPE_RE = /applyListScope\(/;
const RPC_RE = /\.rpc\(/;

function detectBareRlsList(allow: Allowlist) {
  const files = walk(ROOT)
    .map(relPath)
    .filter((rel) => VIEW_LAW_DIR_RE.test(rel) && (rel.endsWith(".ts") || rel.endsWith(".tsx")));

  for (const rel of files) {
    if (isExemptFromAllDetectors(rel)) continue;
    const abs = join(ROOT, rel);
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (!/\.from\(/.test(lines[i])) continue;
      // Gather a small chain window starting at the .from( line.
      const windowEnd = Math.min(lines.length, i + 12);
      const chain = lines.slice(i, windowEnd).join("\n");

      const hasSelect = /\.select\(/.test(chain);
      const hasListShape = /\.order\(|\.limit\(|\.range\(/.test(chain);
      if (!hasSelect || !hasListShape) continue;

      if (RPC_RE.test(chain)) continue;
      if (SINGLE_RECORD_RE.test(chain)) continue;
      if (SCOPE_EQ_RE.test(chain)) continue;
      if (CONTAINS_IN_ID_RE.test(chain)) continue;
      if (APPLY_LIST_SCOPE_RE.test(chain)) continue;

      // Explicit VIEW LAW comment within 5 lines above.
      const above = lines.slice(Math.max(0, i - 5), i).join("\n");
      if (VIEW_LAW_COMMENT_RE.test(above) || VIEW_LAW_COMMENT_RE.test(chain)) continue;

      const lineNo = i + 1;
      if (isAllowed(allow.bareRlsList, rel, lineNo)) continue;

      pushFinding({
        detector: "BARE-RLS LIST",
        severity: "WARN",
        file: rel,
        line: lineNo,
        rule:
          "List-shaped Supabase read (.from + .select + order/limit/range) with no visible " +
          "owner/org/container scope in the chain — THE VIEW LAW requires every list view to be " +
          "scoped, relying on RLS alone is not sufficient defense in depth.",
        fix:
          "Add an .eq(...) owner/org/container filter (or .in(\"id\", ...)) to the chain, wrap it " +
          "with applyListScope(...), or add a `// VIEW LAW: <reason>` comment within 5 lines if " +
          "scope is established elsewhere (e.g. an RPC, or genuinely public data).",
        snippet: lines[i].trim(),
      });
    }
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

function main() {
  const allow = loadAllowlist();

  detectLowestTierDefault(allow);
  detectActiveOrgAccess(allow);
  detectHandRolledLadder(allow);
  detectBareRlsList(allow);

  console.log("");
  console.log(`${BOLD}  ACCESS GUARD CHECK${RESET}`);
  console.log(
    `  ${DIM}Enforcing THE SECURITY PHILOSOPHY + THE VIEW LAW (CLAUDE.md §Supabase, common-docs/systems/db-rules/FEATURE.md §6)${RESET}`
  );
  console.log("");

  if (findings.length === 0) {
    console.log(`${GREEN}${BOLD}  No access-guard findings.${RESET}`);
    console.log("");
    process.exit(0);
  }

  const byDetector = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byDetector.has(f.detector)) byDetector.set(f.detector, []);
    byDetector.get(f.detector)!.push(f);
  }

  let failCount = 0;
  let warnCount = 0;

  for (const [detector, list] of byDetector) {
    const fails = list.filter((f) => f.severity === "FAIL").length;
    const warns = list.filter((f) => f.severity === "WARN").length;
    failCount += fails;
    warnCount += warns;

    console.log(`${CYAN}${BOLD}  ${detector}${RESET} ${DIM}(${fails} FAIL, ${warns} WARN)${RESET}`);
    for (const f of list) {
      const tag = f.severity === "FAIL" ? `${RED}[FAIL]${RESET}` : `${YELLOW}[WARN]${RESET}`;
      console.log(`    ${tag} ${f.file}:${f.line}`);
      console.log(`      ${DIM}rule:${RESET} ${f.rule}`);
      if (f.snippet) console.log(`      ${DIM}code:${RESET} ${f.snippet}`);
      console.log(`      ${DIM}fix:${RESET}  ${f.fix}`);
    }
    console.log("");
  }

  console.log(
    `${BOLD}  ${findings.length} finding(s) — ${failCount} FAIL, ${warnCount} WARN${RESET} ` +
      `${DIM}(allowlist: scripts/access-guards/allowlist.json)${RESET}`
  );
  console.log("");

  if (STRICT && failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
