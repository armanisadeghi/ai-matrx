#!/usr/bin/env npx tsx
/**
 * check:retired-db-ref — stop agents being handed the RETIRED database's id.
 *
 * THE LIVE DB IS `brsgrqvjdzwihsvnfqkf` ("AI Matrx"), served at
 * `https://db.matrxserver.com`. `txzxabzwovsujtloxrus` is the retired old Matrx
 * Main. Supabase still lists it as ACTIVE_HEALTHY, it still accepts DDL, and it
 * still holds a STALE COPY of real data — same table ids, same row ids,
 * plausible values.
 *
 * That combination is what makes this the nastiest wrong-target bug we have:
 * writing there SUCCEEDS, and reading it back CONFIRMS whatever you expected.
 * There is no error to notice. The only symptom is that the running app never
 * sees the change.
 *
 * IT HAS BITTEN REPEATEDLY, and never because someone invented the id — always
 * because the repo handed it over:
 *   - `package.json`'s `db-types` script generated `types/database.types.ts`
 *     from the retired project (fixed 2026-08-19, e632312ec);
 *   - the `db-change` skill's description told agents to use it for "any DDL";
 *   - `docs/official/db-rules.md`, the security canon CLAUDE.md links to,
 *     named it as *the* project.
 * On 2026-08-21 an agent applied a migration there, queried it back, reported
 * "confirmed in the database", and every card in the UI still showed the old
 * value. This script exists so the NEXT one is caught by a machine instead.
 *
 * WHAT IT FLAGS — the retired ref sitting where it will be READ AS AN
 * INSTRUCTION: config and scripts that execute, skills and agent docs, CLAUDE.md
 * and FEATURE.md, and anything under docs/official/.
 *
 * WHAT IT DOES NOT FLAG — honest history. A migration file recording
 * "applied to txzxabzwovsujtloxrus on 2026-06-10" is a true statement about the
 * past, and rewriting it would be falsifying a record. Same for archived docs
 * and handoffs. A line that names the ref while also marking it retired/stale
 * is a WARNING about the trap, not an instance of it, and passes.
 *
 * Loud, ADVISORY, never blocking (exit 0 always, per the repo's
 * scream-never-block rule).
 *
 *   pnpm check:retired-db-ref
 *   pnpm check:retired-db-ref --json
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(__dirname, "..");

const RETIRED_REF = "txzxabzwovsujtloxrus";
const LIVE_REF = "brsgrqvjdzwihsvnfqkf";

/** Directories that never carry instructions — history, build output, deps. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".next-preview",
  "out",
  "dist",
  "coverage",
  "migrations", // records of what was applied, and when — history, not orders
  "archive",
]);

/**
 * Paths whose content an agent reads as "do this". Everything else is prose we
 * tolerate, because the goal is to stop the ref being HANDED OVER, not to purge
 * the string from the repo.
 */
function isInstructional(rel: string): boolean {
  if (rel.includes("/archive/") || rel.includes("docs/handoffs/")) return false;
  return (
    rel === "package.json" ||
    rel === "CLAUDE.md" ||
    rel.startsWith(".claude/") ||
    rel.startsWith(".cursor/") ||
    rel.startsWith("scripts/") ||
    rel.startsWith("docs/official/") ||
    rel.endsWith("CLAUDE.md") ||
    rel.endsWith("FEATURE.md") ||
    rel.endsWith("SKILL.md") ||
    rel.endsWith(".mcp.json") ||
    rel.endsWith("settings.json")
  );
}

/**
 * Does this line WARN about the retired ref rather than instruct with it?
 *
 * Without this, the very documentation that teaches the trap would be reported
 * as the trap — and the guard would pressure people to delete the warning.
 */
function isWarningLine(line: string): boolean {
  return /retired|do not use|don't use|never touch|stale|deprecated|⛔|wrong database|not the live/i.test(
    line,
  );
}

type Finding = { file: string; line: number; text: string };

const findings: Finding[] = [];

function walk(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = relative(ROOT, full);
    if (!isInstructional(rel)) continue;
    // The guard's own prose necessarily names the ref while explaining it.
    if (rel === "scripts/check-retired-db-ref.ts") continue;
    if (st.size > 2_000_000) continue;

    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (!content.includes(RETIRED_REF)) continue;

    content.split("\n").forEach((line, i) => {
      if (!line.includes(RETIRED_REF)) return;
      if (isWarningLine(line)) return;
      findings.push({ file: rel, line: i + 1, text: line.trim().slice(0, 160) });
    });
  }
}

walk(ROOT);

const asJson = process.argv.includes("--json");
if (asJson) {
  console.log(JSON.stringify({ retired: RETIRED_REF, live: LIVE_REF, findings }, null, 2));
  process.exit(0);
}

if (findings.length === 0) {
  console.log(
    `✅ check:retired-db-ref — no instructional file hands out the retired project id.\n` +
      `   Live DB: ${LIVE_REF} (db.matrxserver.com). Retired: ${RETIRED_REF}.`,
  );
  process.exit(0);
}

console.log(
  `\n🚨 check:retired-db-ref — ${findings.length} instructional reference${
    findings.length === 1 ? "" : "s"
  } to the RETIRED database\n`,
);
console.log(
  `   The live DB is ${LIVE_REF} (db.matrxserver.com).\n` +
    `   ${RETIRED_REF} is retired, still writable, and holds a stale COPY —\n` +
    `   so writing there succeeds and reading it back confirms anything.\n` +
    `   Every occurrence below will be read by an agent as an instruction.\n`,
);
for (const f of findings) {
  console.log(`   ${f.file}:${f.line}`);
  console.log(`      ${f.text}`);
}
console.log(
  `\n   Fix: point it at ${LIVE_REF}, or mark the line as retired/historical\n` +
    `   (a line that says "retired" or "stale" is a warning, and passes).\n`,
);
// Advisory by design — see the header. Never block a build.
process.exit(0);
