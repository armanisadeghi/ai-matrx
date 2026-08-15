#!/usr/bin/env tsx
/**
 * Visibility vocabulary check — the guard that keeps the ONE visibility
 * vocabulary from re-collapsing (features/sharing/FEATURE.md — the durable
 * contract; FOUND_DEFECTS.md D106b — the remaining surfaces).
 *
 * The DB vocabulary is `personal | internal | link | public` — exactly four
 * values, one meaning each (docs/official/db-rules.md §6). Two failure classes
 * this repo has already shipped, both silent:
 *
 *   1. RETIRED SPELLINGS. `shared` and `private` are retired enum spellings —
 *      the server rewrites either to `personal` (matrx_utils LEGACY_VISIBILITY_MAP),
 *      so a client that writes them silently DOWNGRADES the row. A union or
 *      literal that carries them is a live data-loss path, not a style issue.
 *   2. THE COLLAPSE. A per-domain visibility union that omits `internal`
 *      folds "the whole org can read this" into "belongs to one person" —
 *      the exact bug that made ~11k org-readable files claim "Only you".
 *   3. UNPROVABLE PRIVACY CLAIMS. A UI string "Only you" asserts something a
 *      single visibility column cannot prove — visibility is ONE of six grant
 *      paths in iam.has_access_for_base. Surfaces state what they know, or
 *      mount <AccessSummaryPanel> (features/sharing) for the real answer.
 *
 * All detectors are ADVISORY (loud, non-blocking) by default; `--strict`
 * exits 1 on any finding. Nothing runs this at commit time — run it via
 * `pnpm check:visibility-vocab` or as part of `pnpm check:release-gates`.
 *
 * Allowlist: scripts/visibility-vocab/allowlist.json. The bar for adding an
 * entry: a justification that names WHY the claim is provable there, or the
 * FOUND_DEFECTS id tracking its removal (D106b for the baseline set).
 * Never allowlist a NEW write path that sends `shared`/`private` to the server.
 * An entry that suppresses NOTHING is reported as `[STALE]` — it blinds its
 * whole file, so fixing a surface must delete its entry in the same change.
 *
 * Exit codes: 0 clean (or findings without --strict) · 1 findings + --strict · 2 script error
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

const RED = "\x1b[31m";
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
  retiredSpelling: AllowEntry[];
  collapsedUnion: AllowEntry[];
  onlyYouClaim: AllowEntry[];
}

function loadAllowlist(): Allowlist {
  const p = join(ROOT, "scripts/visibility-vocab/allowlist.json");
  if (!existsSync(p)) {
    return { retiredSpelling: [], collapsedUnion: [], onlyYouClaim: [] };
  }
  const raw = JSON.parse(readFileSync(p, "utf8"));
  return {
    retiredSpelling: raw.retiredSpelling ?? [],
    collapsedUnion: raw.collapsedUnion ?? [],
    onlyYouClaim: raw.onlyYouClaim ?? [],
  };
}

/**
 * Which allowlist entries actually suppressed something this run. An entry
 * that matches NOTHING is not harmless: a file-level entry silently blinds the
 * whole file, so a NEW false claim added to a already-fixed surface would never
 * fire. Stale entries are reported (below) instead of rotting quietly — this is
 * exactly how two fixed surfaces kept their exemptions after the claim was gone.
 */
const usedEntries = new Set<string>();

function entryKey(detector: string, e: AllowEntry): string {
  return `${detector}|${e.file}|${e.line ?? "*"}`;
}

function isAllowed(
  detector: keyof Allowlist,
  entries: AllowEntry[],
  file: string,
  line: number,
): boolean {
  let allowed = false;
  for (const e of entries) {
    if (e.file !== file) continue;
    if (e.line != null && Math.abs(e.line - line) > 2) continue;
    usedEntries.add(entryKey(detector, e));
    allowed = true;
  }
  return allowed;
}

// ─── Repo file listing ──────────────────────────────────────────────────────

const IGNORE_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);

// Dot-dirs are ALWAYS skipped — .git, every .next* build dir, and
// .claude/worktrees (full repo copies). Same rule as check-access-guards.ts.
function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith(".") || IGNORE_DIRS.has(name)) continue;
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

// The checker's own source contains the literals it hunts; generated files
// mirror the backend contract (which still ACCEPTS legacy spellings inbound)
// and are a codegen concern, not an authored decision.
const SELF_FILE = "scripts/check-visibility-vocab.ts";
const EXEMPT_RE =
  /^(types\/database\.types\.ts|types\/python-generated\/|scripts\/visibility-vocab\/)/;

function isExempt(rel: string): boolean {
  return rel === SELF_FILE || EXEMPT_RE.test(rel);
}

// ─── Findings ───────────────────────────────────────────────────────────────

interface Finding {
  detector: keyof Allowlist;
  file: string;
  line: number;
  rule: string;
  fix: string;
  snippet: string;
}

const findings: Finding[] = [];

// ─── Detection ──────────────────────────────────────────────────────────────

const CANONICAL = ["personal", "internal", "link", "public"];
const RETIRED = ["private", "shared"];

// A chain of ≥2 quoted string literals separated by `|` on one line.
const UNION_RE = /(['"])[\w-]+\1(?:\s*\|\s*(['"])[\w-]+\2)+/g;
const MEMBER_RE = /['"]([\w-]+)['"]/g;

function unionMembers(chain: string): string[] {
  const out: string[] = [];
  for (const m of chain.matchAll(MEMBER_RE)) out.push(m[1]);
  return out;
}

/**
 * Is this union talking about visibility? Either it carries a canonical
 * visibility-only member (personal/internal/link), or the line names
 * visibility, or it is the retired trio itself (private+shared+public).
 */
// Members that mark a union as a list-scope FILTER ("shared with me" tabs,
// admin scope pickers) or a non-visibility domain setting — different concept,
// different vocabulary, not this check's business.
const NOT_VISIBILITY_MARKERS = new Set(["all", "mine", "system", "team"]);

function isVisibilityShaped(members: string[], line: string): boolean {
  if (members.some((m) => NOT_VISIBILITY_MARKERS.has(m))) return false;
  if (members.some((m) => m === "personal" || m === "internal" || m === "link"))
    return true;
  if (/visibility/i.test(line)) return true;
  if (members.includes("private") && members.includes("shared")) return true;
  return false;
}

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    // JSX comment bodies — `{/* … */}` across lines. Documenting this rule
    // beside a fixed surface must not re-trip the rule (VaultItemDetail cited
    // the doctrine in a comment and the checker flagged its own fix).
    trimmed.startsWith("{/*") ||
    trimmed.endsWith("*/}") ||
    trimmed.endsWith("*/")
  );
}

/**
 * "Only you, people you share with, and members of your org…" is the CORRECT
 * form — an enumeration that names every path is exactly what this check asks
 * for. Only the absolute claim ("Only you." / "Only you can see this") lies.
 *
 * A comma alone is NOT enough. "Only you, until you explicitly share a link"
 * is the original education-FAQ lie wearing a comma: it asserts that RIGHT NOW
 * only you can see it, and promises the future instead of naming a second
 * party. So an exemption requires BOTH:
 *   1. no temporal/conditional hedge ("until", "unless", "once you", "when you")
 *      — those describe what happens later, not who can see it now; and
 *   2. an actual PARTY named after the comma (people, members, org, anyone…).
 */
const TEMPORAL_HEDGE_RE = /\b(until|unless|once you|when you)\b/i;
const NAMED_PARTY_RE =
  /\b(people|members?|anyone|users?|admins?|teammates?|collaborators?|grantees?|organizations?|org|team|those)\b/i;

function isHonestEnumeration(line: string): boolean {
  const m = /\bOnly you\s*,/.exec(line);
  if (!m) return false;
  const rest = line.slice(m.index + m[0].length);
  if (TEMPORAL_HEDGE_RE.test(rest)) return false;
  return NAMED_PARTY_RE.test(rest);
}

/**
 * The SAME two union detectors, for a vocabulary declared as a multi-line
 * `as const` array rather than a one-line `A | B | C` union:
 *
 *   export const LIST_VISIBILITY_VALUES = ["public", "authenticated", "private"] as const;
 *   export type ListVisibility = (typeof LIST_VISIBILITY_VALUES)[number];
 *
 * This shape is IDENTICAL in effect to the union and is the modern way to
 * write one, but the line-based scan cannot see it — `features/user-lists`
 * refactored into it and its live retired `'private'` silently stopped being
 * reported. A detector that only sees one spelling of a vocabulary is a
 * detector that goes blind the day someone modernizes.
 */
const CONST_ARRAY_RE =
  /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=\n]+)?=\s*\[([^\]]*)\]\s*as\s+const/g;

function scanConstArrays(rel: string, text: string, allow: Allowlist): void {
  for (const m of text.matchAll(CONST_ARRAY_RE)) {
    const [, name, body] = m;
    const members = unionMembers(body);
    if (members.length < 2) continue;
    // Reuse the union heuristics — the declaration NAME carries the
    // "is this visibility?" signal that the one-line form got from its line.
    if (!isVisibilityShaped(members, name)) continue;

    const lineNo = text.slice(0, m.index).split("\n").length;
    const snippet = `const ${name} = [${members.map((v) => `"${v}"`).join(", ")}] as const`;

    const retired = members.filter((v) => RETIRED.includes(v));
    if (retired.length > 0) {
      if (!isAllowed("retiredSpelling", allow.retiredSpelling, rel, lineNo)) {
        findings.push({
          detector: "retiredSpelling",
          file: rel,
          line: lineNo,
          rule: `Retired visibility spelling ${retired.map((r) => `'${r}'`).join(", ")} in an \`as const\` vocabulary — the server silently rewrites it to 'personal' (data downgrade).`,
          fix: `Use the canonical values: ${CANONICAL.map((c) => `'${c}'`).join(" | ")} (features/files/types.ts#Visibility). Normalize legacy reads via toVisibility().`,
          snippet: snippet.slice(0, 160),
        });
      }
      continue;
    }

    if (
      members.includes("personal") &&
      members.includes("public") &&
      !members.includes("internal")
    ) {
      if (!isAllowed("collapsedUnion", allow.collapsedUnion, rel, lineNo)) {
        findings.push({
          detector: "collapsedUnion",
          file: rel,
          line: lineNo,
          rule: `Visibility vocabulary omits 'internal' — collapsing "org-readable" into "belongs to one person" is the bug that mislabeled ~11k files.`,
          fix: `Carry all four values (${CANONICAL.join(" | ")}), or reuse Database["platform"]["Enums"]["visibility"].`,
          snippet: snippet.slice(0, 160),
        });
      }
    }
  }
}

function scanFile(rel: string, text: string, allow: Allowlist): void {
  const lines = text.split("\n");
  scanConstArrays(rel, text, allow);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const trimmed = line.trim();
    const inComment = isCommentLine(trimmed);

    // Detectors 1 + 2 — visibility-shaped unions.
    if (!inComment) {
      for (const m of line.matchAll(UNION_RE)) {
        const members = unionMembers(m[0]);
        if (!isVisibilityShaped(members, line)) continue;

        const retired = members.filter((v) => RETIRED.includes(v));
        if (retired.length > 0) {
          if (!isAllowed("retiredSpelling", allow.retiredSpelling, rel, lineNo)) {
            findings.push({
              detector: "retiredSpelling",
              file: rel,
              line: lineNo,
              rule: `Retired visibility spelling ${retired.map((r) => `'${r}'`).join(", ")} — the server silently rewrites it to 'personal' (data downgrade).`,
              fix: `Use the canonical union: ${CANONICAL.map((c) => `'${c}'`).join(" | ")} (features/files/types.ts#Visibility). Normalize legacy reads via toVisibility().`,
              snippet: trimmed.slice(0, 160),
            });
          }
          continue; // don't double-report the same chain under detector 2
        }

        if (
          members.includes("personal") &&
          members.includes("public") &&
          !members.includes("internal")
        ) {
          if (!isAllowed("collapsedUnion", allow.collapsedUnion, rel, lineNo)) {
            findings.push({
              detector: "collapsedUnion",
              file: rel,
              line: lineNo,
              rule: `Visibility union omits 'internal' — collapsing "org-readable" into "belongs to one person" is the bug that mislabeled ~11k files.`,
              fix: `Carry all four values (${CANONICAL.join(" | ")}), or reuse Database["platform"]["Enums"]["visibility"].`,
              snippet: trimmed.slice(0, 160),
            });
          }
        }
      }
    }

    // Detector 3 — unprovable privacy claims in user-visible strings.
    if (!inComment && /\bOnly you\b/.test(line) && !isHonestEnumeration(line)) {
      if (!isAllowed("onlyYouClaim", allow.onlyYouClaim, rel, lineNo)) {
        findings.push({
          detector: "onlyYouClaim",
          file: rel,
          line: lineNo,
          rule: `"Only you" is a claim about PEOPLE that one visibility column cannot prove — visibility is one of six grant paths.`,
          fix: `Say what you know ("Personal" describes the setting), or mount <AccessSummaryPanel entityType entityId /> for the true answer.`,
          snippet: trimmed.slice(0, 160),
        });
      }
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): number {
  const allow = loadAllowlist();
  const files = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f));

  for (const abs of files) {
    const rel = relPath(abs);
    if (isExempt(rel)) continue;
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    scanFile(rel, text, allow);
  }

  const titles: Record<keyof Allowlist, string> = {
    retiredSpelling: "Retired visibility spellings ('shared' / 'private')",
    collapsedUnion: "Visibility unions missing 'internal' (the collapse)",
    onlyYouClaim: 'Unprovable "Only you" privacy claims',
  };

  console.log(`${BOLD}Visibility vocabulary check${RESET}`);
  console.log(
    `${DIM}Canonical: personal | internal | link | public — one vocabulary, no dialects.${RESET}\n`,
  );

  // Stale allowlist entries — reported BEFORE the early return, because a
  // clean run is exactly when they hide. An entry that suppressed nothing
  // either guards a surface that was fixed (delete it, re-arm the guard) or a
  // violation a detector went blind to (fix the detector). Loud, non-blocking:
  // a stale entry usually means good news (someone fixed the surface), and
  // failing a release on good news is wrong.
  const stale: { detector: keyof Allowlist; entry: AllowEntry }[] = [];
  for (const detector of Object.keys(allow) as (keyof Allowlist)[]) {
    for (const e of allow[detector]) {
      if (!usedEntries.has(entryKey(detector, e))) stale.push({ detector, entry: e });
    }
  }

  if (stale.length > 0) {
    console.log(
      `${CYAN}${BOLD}Stale allowlist entries${RESET} — ${stale.length} ${DIM}(suppressed nothing this run)${RESET}`,
    );
    for (const { detector, entry } of stale) {
      console.log(
        `  ${RED}[STALE]${RESET} ${entry.file}${entry.line != null ? `:${entry.line}` : ""} ${DIM}(${detector})${RESET}`,
      );
      console.log(
        `    ${DIM}why:${RESET}  it blinds that file — a NEW violation there would not fire.`,
      );
      console.log(
        `    ${DIM}fix:${RESET}  surface fixed → delete the entry (that re-arms the guard). Violation still present → the detector went blind; fix the detector.`,
      );
    }
    console.log("");
  }

  if (findings.length === 0) {
    console.log(`${GREEN}✓ No findings. The vocabulary holds.${RESET}`);
    return 0;
  }

  for (const detector of Object.keys(titles) as (keyof Allowlist)[]) {
    const hits = findings.filter((f) => f.detector === detector);
    if (hits.length === 0) continue;
    console.log(`${CYAN}${BOLD}${titles[detector]}${RESET} — ${hits.length}`);
    for (const f of hits) {
      console.log(`  ${RED}[FAIL]${RESET} ${f.file}:${f.line}`);
      console.log(`    ${DIM}code:${RESET} ${f.snippet}`);
      console.log(`    ${DIM}rule:${RESET} ${f.rule}`);
      console.log(`    ${DIM}fix:${RESET}  ${f.fix}`);
    }
    console.log("");
  }

  console.log(
    `${BOLD}${findings.length} finding(s).${RESET} Allowlist (justification required): ${DIM}scripts/visibility-vocab/allowlist.json${RESET}`,
  );

  if (STRICT) return 1;
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`${RED}check-visibility-vocab crashed:${RESET}`, err);
  process.exit(2);
}
