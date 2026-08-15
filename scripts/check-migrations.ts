#!/usr/bin/env npx tsx
/**
 * Migration ledger check — the matrx-frontend half of the cross-repo migration
 * durability system. See the "Database migrations" section in CLAUDE.md.
 *
 * Supabase (`txzxabzwovsujtloxrus`) is the source of truth for the database — NOT
 * the .sql files in `migrations/`. A migration file sitting on disk has changed
 * NOTHING until it is applied. Agents keep writing one and reporting "done"; the
 * file never ran, types were never regenerated, and production breaks days later.
 *
 * This script makes that failure LOUD. It reads the shared ledger
 * `public._schema_migrations` (rows where source='matrx-frontend' — the same table
 * aidream's db/apply_migrations.py writes, on the same DB) and diffs it against the
 * local `migrations/*.sql`. Anything on disk that the ledger has never seen, or whose
 * checksum drifted, is screamed in a big red box.
 *
 * It is READ-ONLY: it never writes the ledger, so we can never mark a migration
 * "applied" that did not truly run. To apply + record a pending/drifted migration,
 * either apply it via the Supabase MCP (apply_migration) and write the ledger row
 * yourself (insert/update _schema_migrations with source='matrx-frontend', the
 * filename, and the SHA-256 of the file), or from the aidream repo run:
 *     python db/apply_migrations.py --source matrx-frontend
 * (which applies and records in one step). `./scripts/release.sh` runs that
 * applier automatically before bumping — see the finalize-and-ship skill.
 *
 *   pnpm check:migrations            # loud, non-blocking (exit 0) — for hooks
 *   pnpm check:migrations --strict   # exit 1 when anything is unapplied — for CI
 *
 * Exit codes:
 *   0  clean, OR unapplied found in default (non-blocking) mode, OR creds absent
 *   1  unapplied/drifted found AND --strict
 *   2  unexpected error (DB fetch failed)
 *
 * A migration intentionally not meant to apply (superseded, destructive, already
 * live) is exempted with `-- migrate: skip: <reason>` in its first 25 lines — the
 * same marker aidream's tooling honors.
 *
 * During the 2026 DB transition, checksum drift on shared-main migration files
 * that were applied via MCP is exempt via `migrations/DB_TRANSITION_DRIFT_OK.txt`
 * (delete that file when the transition completes and ledger checksums reconcile).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tryReadAllRowsRest } from "../lib/supabase/readAllRows";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "matrx-frontend";
const MIGRATIONS_DIR = resolve(ROOT, "migrations");
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

// Match the release.sh log vocabulary: [INFO] cyan, [WARN] yellow, [FAIL] red.
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
};

const SKIP_MARKER = /^\s*--\s*migrate\s*:\s*skip(?:\s*:\s*(.+))?\s*$/i;

function skipReason(sql: string): string | null {
  const lines = sql.split("\n", 25);
  for (const line of lines) {
    const m = line.match(SKIP_MARKER);
    if (m) return (m[1] ?? "").trim();
  }
  return null;
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Resolve Supabase URL + a key. There is exactly ONE name for the URL —
 *  `NEXT_PUBLIC_SUPABASE_URL`; never a second candidate or a fallback chain
 *  (see common-docs/policies/package-vs-implementation.md). The KEY degrades
 *  secret → publishable on purpose: same database, lower privilege, because
 *  `_schema_migrations` may be RLS-guarded against anon.
 *  Reads .env* like the other gate scripts (scripts/check-tool-db-drift.ts). */
function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";

  // The env-file scan below reads whatever it finds; keep the two key names
  // apart so the SECRET one always wins. Collapsing them into one `key` slot
  // filled by first-match makes the winner depend on LINE ORDER in .env.local
  // — and the publishable key sits above the secret one there, so the check
  // authenticated as anon, got 42501/401 on `_schema_migrations`, and reported
  // "creds absent — ledger check skipped". Loud mode swallowed that, but
  // --strict turned it into an exit 2 that blocked every release for a reason
  // that had nothing to do with migrations (2026-08-13).
  let fileSecret = "";
  let filePublishable = "";

  if (!url || !key) {
    for (const f of [
      ".env.local",
      ".env.production.local",
      ".env.production",
      ".env",
    ]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        const v = (raw ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && k === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!fileSecret && k === "SUPABASE_SECRET_KEY") fileSecret = v;
        if (!filePublishable && k === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
          filePublishable = v;
      }
      if (url && fileSecret) break;
    }
    key = key || fileSecret || filePublishable;
  }
  return url && key ? { url, key } : null;
}

interface LedgerRow {
  filename: string;
  checksum: string;
}

/**
 * Fetch EVERY ledger row for this source.
 *
 * PostgREST caps a response at `db-max-rows` (1000 here) and says so only in a
 * `Content-Range` header, so an unpaginated read drops the tail of the ledger and
 * this script reads every dropped row as "never applied" — truncation wearing the
 * costume of absence (measured 2026-08-14; `--strict` turned it into a hard
 * release failure). `tryReadAllRowsRest` owns the paging + completeness proof;
 * see lib/supabase/readAllRows.ts.
 *
 * Returns null on fetch failure OR a provably-incomplete read (both are "check
 * skipped, loudly" — never a confidently wrong list of unapplied migrations).
 */
async function fetchLedger(
  url: string,
  key: string,
): Promise<LedgerRow[] | null> {
  const rows = await tryReadAllRowsRest<LedgerRow>({
    url,
    key,
    // The proxy at db.matrxserver.com defaults to schema 'api'; this table is in 'public'.
    schema: "public",
    // Order by the primary key so paging is stable.
    path:
      `_schema_migrations?source=eq.${encodeURIComponent(SOURCE)}` +
      `&select=filename,checksum&order=filename.asc`,
    label: "public._schema_migrations",
  });
  if (rows === null) {
    console.error(
      `${TAG.warn}Migrations: ledger read failed or was incomplete — ledger check ` +
        `skipped rather than reporting the missing rows as unapplied`,
    );
    return null;
  }
  return rows;
}

function listSql(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

const DRIFT_OK_FILE = resolve(MIGRATIONS_DIR, "DB_TRANSITION_DRIFT_OK.txt");

/** Filename allowlist — drift on these files is expected during DB transition. */
function loadDriftOkSet(): Set<string> {
  if (!existsSync(DRIFT_OK_FILE)) return new Set();
  const ok = new Set<string>();
  for (const line of readFileSync(DRIFT_OK_FILE, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    ok.add(trimmed);
  }
  return ok;
}

async function main(): Promise<number> {
  const strict = process.argv.includes("--strict");

  const files = listSql(MIGRATIONS_DIR);
  if (files.length === 0) return 0; // nothing to check — stay quiet

  // Classify local files: skip-marked vs trackable, with checksums.
  const skipped: string[] = [];
  const local = new Map<string, string>(); // filename -> checksum
  for (const f of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
    if (skipReason(sql) !== null) {
      skipped.push(f);
      continue;
    }
    local.set(f, sha256(sql));
  }

  const env = loadEnv();
  if (!env) {
    console.log(
      `${TAG.warn}Migrations: Supabase creds absent — ledger check skipped`,
    );
    return 0; // never block on missing local creds
  }

  const ledgerRows = await fetchLedger(env.url, env.key);
  if (ledgerRows === null) {
    // DB unreachable is NOT migration drift — never block a commit on it.
    return strict ? 2 : 0;
  }
  const ledger = new Map(ledgerRows.map((r) => [r.filename, r.checksum]));

  const driftOk = loadDriftOkSet();
  const pending: string[] = []; // on disk, never recorded
  const drifted: string[] = []; // recorded, but file content changed since
  for (const [f, sum] of local) {
    if (!ledger.has(f)) pending.push(f);
    else if (ledger.get(f) !== sum && !driftOk.has(f)) drifted.push(f);
  }

  // Clean: every tracked migration is recorded and unchanged. Stay quiet.
  if (pending.length === 0 && drifted.length === 0) return 0;

  // Two valid fixes for BOTH states below: apply via the Supabase MCP
  // (apply_migration) + write the ledger row yourself, or run aidream's batch
  // applier which does both. White, not dim — it's an instruction the user
  // acts on, not a footnote. See the finalize-and-ship skill.
  const fix =
    `${C.white}Fix — apply via Supabase MCP (apply_migration) + record in _schema_migrations, ` +
    `or from aidream:${C.reset} ${C.white}python db/apply_migrations.py --source ${SOURCE}${C.reset}`;

  // Leading blank line separates our output from the command the user just typed.
  console.log();

  // Unapplied is the real emergency (a file never ran) → [FAIL] red.
  // Drift-only is recorded-but-edited → [WARN] yellow. Never scream "unapplied"
  // when nothing is unapplied.
  if (pending.length) {
    console.log(
      `${TAG.fail}Migrations: ${pending.length} unapplied — never ran on the DB. ` +
        `${strict ? "(--strict: blocking)" : "(non-blocking)"}`,
    );
    for (const f of pending)
      console.log(`  ${C.white}- ${f}${C.reset} ${C.red}[UNAPPLIED]${C.reset}`);
    for (const f of drifted)
      console.log(
        `  ${C.white}- ${f}${C.reset} ${C.yellow}[DRIFTED]${C.reset}`,
      );
    console.log(`  ${fix}`);
  } else {
    console.log(
      `${TAG.warn}Migrations: ${drifted.length} drifted — recorded as applied, but the file changed since. (non-blocking)`,
    );
    for (const f of drifted)
      console.log(
        `  ${C.white}- ${f}${C.reset} ${C.yellow}[DRIFTED]${C.reset}`,
      );
    console.log(`  ${fix}`);
  }

  return pending.length && strict ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(
      `${C.red}check:migrations — unexpected error:${C.reset}`,
      err,
    );
    process.exit(2);
  },
);
