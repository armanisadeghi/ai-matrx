#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// check-campaign-cic-invalid-guard.mjs — a campaign file that says "if not exists" over a
// CONCURRENT index build must also say what happens when that index EXISTS AND IS INVALID.
//
// 🚨 THE CLASS (lane STORE-READ-PERF-3, 2026-09-25; guard built lane INDEX-GUARD, 2026-09-25).
// `readperf_the_page_scan_has_its_indexes.sql` and `readperf_the_class_finds_its_row_without_a_scan.sql`
// each ran `create index concurrently if not exists <name> …` on production. One build errored or
// was cancelled mid-way and left an INVALID index behind under that exact name — Postgres never
// rolls a CONCURRENTLY build back. `IF NOT EXISTS` only asks "does a relation with this name
// exist?", and an invalid index answers yes, so the statement is a silent no-op FOREVER: nothing
// ever re-tries it, nothing tells anyone it never built, and the planner cannot use it (every
// lookup that would have used it falls through to a full scan, forever, until someone happens to
// query pg_index by hand — five days on production before that happened here).
//
// So this check flags every `create index concurrently if not exists` in a campaign file that
// carries no INVALID-INDEX GUARD: a preceding statement in the SAME file that reads pg_index's
// `indisvalid` and reacts to it — at minimum by REFUSING the apply loudly (a `raise exception`
// naming the index and the one-line remedy, `drop index concurrently if exists <schema>.<name>;`,
// so a human or the next lane actually retries it) rather than trusting `IF NOT EXISTS` to mean
// "and it's fine". A DROP INDEX CONCURRENTLY cannot run inside a transaction block (so it cannot
// live inside the same `do $$ … $$` that reads pg_index) — the guard's job is to make the silent
// no-op LOUD, not to self-heal; self-healing an already-failed build is what
// `scripts/night/invalid-indexes.sh --fix` and this class's rebuild files
// (`storereadperf3_the_invalid_record_indexes_are_rebuilt.sql`) are for.
//
// Usage:
//   node scripts/db/check-campaign-cic-invalid-guard.mjs                 lint migrations/campaign/*.sql
//   node scripts/db/check-campaign-cic-invalid-guard.mjs --census        list every file using the
//                                                                        pattern, guarded or not,
//                                                                        and change nothing
//   node scripts/db/check-campaign-cic-invalid-guard.mjs --self-test     fixture strings, no filesystem
// Exit: 0 nothing unguarded (or --census/--self-test passed) · 1 an unguarded file found.
//
// 🚨 Ledgered files are NEVER rewritten by this check or because of it — a file already applied to
// production is production's history; the census below exists so a HUMAN/lane decision about them
// is made with eyes open, not so this check edits them.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const CAMPAIGN_DIR = join(REPO_ROOT, "migrations", "campaign");
const ALLOWLIST_PATH = join(__dirname, "campaign-cic-invalid-guard-allowlist.json");

// A CLOSED census of files that predate this check, already applied/ledgered on production — see
// the allowlist file's own comment. It exempts nothing NEW: a file not already on this list is
// judged in full, and the list is for the census this task asked for, not a way to silence the
// check going forward.
function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  try {
    const j = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
    return new Set(Array.isArray(j.files) ? j.files : []);
  } catch {
    return new Set();
  }
}

const CIC_RE = /create\s+index\s+concurrently\s+if\s+not\s+exists\s+([a-zA-Z_][\w.]*)/gi;
// The guard preamble: a statement, earlier in the file, that names BOTH the catalog view and the
// column that answers "did this build actually finish" — pg_index.indisvalid. Deliberately loose
// (case-insensitive, whitespace-agnostic) so a guard written any reasonable way still counts; the
// point is that pg_index and indisvalid are both named somewhere the create statement can lean on.
const GUARD_RE = /pg_index/i;
const INDISVALID_RE = /indisvalid/i;

function findUnguarded(text) {
  const lines = text.split("\n");
  // Byte offset -> line number, so a match's position can be compared against the guard's.
  let offset = 0;
  const lineStarts = lines.map((l) => {
    const start = offset;
    offset += l.length + 1;
    return start;
  });
  const lineOf = (idx) => {
    let lo = 0, hi = lineStarts.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid] <= idx) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans + 1; // 1-based
  };

  const guardLines = [];
  lines.forEach((l, i) => {
    if (GUARD_RE.test(l) && INDISVALID_RE.test(l)) guardLines.push(i + 1);
  });
  // A guard spanning two lines (pg_index on one, indisvalid on the next inside a join/where) is
  // real in practice, so also scan a 3-line sliding window for the pair.
  for (let i = 0; i < lines.length - 2; i++) {
    const window = lines.slice(i, i + 3).join(" ");
    if (GUARD_RE.test(window) && INDISVALID_RE.test(window)) guardLines.push(i + 1, i + 2, i + 3);
  }
  const guardLineSet = new Set(guardLines);
  const earliestGuardLine = guardLineSet.size ? Math.min(...guardLineSet) : Infinity;

  const findings = [];
  let m;
  CIC_RE.lastIndex = 0;
  while ((m = CIC_RE.exec(text)) !== null) {
    const line = lineOf(m.index);
    if (line <= earliestGuardLine) {
      // No guard at all, or the only guard in the file comes AFTER this create statement —
      // useless to it (a preamble guards what follows it, not what preceded it).
      findings.push({ index: m[1], line });
    }
  }
  return findings;
}

function census() {
  const files = readdirSync(CAMPAIGN_DIR).filter((f) => f.endsWith(".sql"));
  const rows = [];
  for (const f of files) {
    const text = readFileSync(join(CAMPAIGN_DIR, f), "utf8");
    if (!CIC_RE.test(text)) continue;
    const unguarded = findUnguarded(text);
    rows.push({ file: f, unguarded: unguarded.length, guarded: unguarded.length === 0 });
  }
  return rows;
}

function selfTest() {
  let rc = 0;
  const RED = "create index concurrently if not exists foo_idx on s.t (a);\n";
  const r1 = findUnguarded(RED);
  if (r1.length === 1 && r1[0].index === "foo_idx") console.log("PASS: unguarded CIC is flagged");
  else { console.log("FAIL: unguarded CIC was not flagged", r1); rc = 1; }

  const GREEN = [
    "do $$ begin",
    "  if exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid",
    "             where c.relname = 'foo_idx' and not i.indisvalid) then",
    "    raise exception 'foo_idx exists and is INVALID -- drop it concurrently first: drop index concurrently if exists s.foo_idx;';",
    "  end if;",
    "end $$;",
    "",
    "create index concurrently if not exists foo_idx on s.t (a);",
  ].join("\n");
  const r2 = findUnguarded(GREEN);
  if (r2.length === 0) console.log("PASS: a guarded CIC is not flagged");
  else { console.log("FAIL: a guarded CIC was flagged anyway", r2); rc = 1; }

  const GUARD_AFTER = [
    "create index concurrently if not exists foo_idx on s.t (a);",
    "select indisvalid from pg_index where 1=0;",
  ].join("\n");
  const r3 = findUnguarded(GUARD_AFTER);
  if (r3.length === 1) console.log("PASS: a guard that comes AFTER the create is still flagged");
  else { console.log("FAIL: a guard after the create should still flag", r3); rc = 1; }

  console.log(`self-test: ${rc === 0 ? "GREEN" : "RED"}`);
  return rc;
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) process.exit(selfTest());

if (args.includes("--census")) {
  const allowlist = loadAllowlist();
  const rows = census();
  if (rows.length === 0) {
    console.log("census: no campaign file uses `create index concurrently if not exists`.");
  } else {
    console.log(`census: ${rows.length} campaign file(s) use \`create index concurrently if not exists\`:`);
    for (const r of rows) {
      const tag = r.guarded ? "guarded  " : allowlist.has(r.file) ? "grandfathered (ledgered, pre-check)" : "UNGUARDED";
      console.log(`  ${tag}  ${r.file}${r.guarded ? "" : ` (${r.unguarded} unguarded statement(s))`}`);
    }
  }
  process.exit(0);
}

// ── lint mode ──────────────────────────────────────────────────────────────
const allowlist = loadAllowlist();
const rows = census();
const bad = rows.filter((r) => !r.guarded && !allowlist.has(r.file));
const grandfathered = rows.filter((r) => !r.guarded && allowlist.has(r.file));
if (grandfathered.length) {
  console.log(`check-campaign-cic-invalid-guard: ${grandfathered.length} pre-existing, already-ledgered file(s) grandfathered (never rewritten): ${grandfathered.map((r) => r.file).join(", ")}`);
}
if (bad.length === 0) {
  console.log(`check-campaign-cic-invalid-guard: PASS (${rows.length} file(s) use the pattern; ${rows.length - grandfathered.length} guarded or new-and-clean, ${grandfathered.length} grandfathered)`);
  process.exit(0);
}
console.log("check-campaign-cic-invalid-guard: FAIL — a `create index concurrently if not exists` with no invalid-index guard before it:");
for (const r of bad) {
  console.log(`  ${r.file} — ${r.unguarded} unguarded statement(s)`);
}
console.log("");
console.log("Remedy (add BEFORE each flagged create, naming that exact index):");
console.log("  do $$ begin");
console.log("    if exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid");
console.log("               where c.relname = '<index>' and not i.indisvalid) then");
console.log("      raise exception '<index> exists and is INVALID -- drop it concurrently first: drop index concurrently if exists <schema>.<index>;';");
console.log("    end if;");
console.log("  end $$;");
console.log("");
console.log("A file already ledgered/applied is NEVER rewritten for this — see this script's header.");
process.exit(1);
