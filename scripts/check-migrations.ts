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
 * It is READ-ONLY: it never writes the ledger. Recording is the applier's job (the
 * one box with DB write creds), so we can never mark a migration "applied" that did
 * not truly run. To apply + record a pending migration, from the aidream repo run:
 *     python db/apply_migrations.py --source matrx-frontend
 * (or apply a one-off via the Supabase MCP, then re-run that to record it).
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
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "matrx-frontend";
const MIGRATIONS_DIR = resolve(ROOT, "migrations");
// Stray migration dirs that exist outside the canonical migrations/. We don't track
// them (yet) — we just warn so they get consolidated. See CLAUDE.md.
const STRAY_DIRS = [
  "features/artifacts/migrations",
  "features/transcripts/migrations",
  "database/migrations",
];

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
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

/** Resolve Supabase URL + a key. Prefer the secret key — `_schema_migrations` may be
 *  RLS-guarded against anon. Falls back to publishable so a read still works if RLS
 *  is open. Reads .env* like the other gate scripts (scripts/check-tool-db-drift.ts). */
function loadEnv(): { url: string; key: string } | null {
  let url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    "";

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
        if (!url && (k === "NEXT_PUBLIC_SUPABASE_URL" || k === "SUPABASE_URL"))
          url = v;
        if (
          !key &&
          (k === "SUPABASE_SECRET_KEY" ||
            k === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ||
            k === "SUPABASE_PUBLISHABLE_KEY")
        )
          key = v;
      }
      if (url && key) break;
    }
  }
  return url && key ? { url, key } : null;
}

interface LedgerRow {
  filename: string;
  checksum: string;
}

/** Returns null on fetch failure (caller decides whether that blocks). */
async function fetchLedger(
  url: string,
  key: string,
): Promise<LedgerRow[] | null> {
  const endpoint =
    `${url.replace(/\/$/, "")}/rest/v1/_schema_migrations` +
    `?source=eq.${encodeURIComponent(SOURCE)}&select=filename,checksum`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        // The proxy at db.matrxserver.com defaults to schema 'api'; this table is in 'public'.
        "Accept-Profile": "public",
      },
    });
  } catch (err) {
    console.error(
      `${TAG.warn}Migrations: could not reach Supabase — ledger check skipped (${String(err)})`,
    );
    return null;
  }
  if (!res.ok) {
    console.error(
      `${TAG.warn}Migrations: Supabase fetch failed (${res.status}) — ledger check skipped`,
    );
    return null;
  }
  return (await res.json()) as LedgerRow[];
}

function listSql(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
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

  const pending: string[] = []; // on disk, never recorded
  const drifted: string[] = []; // recorded, but file content changed since
  for (const [f, sum] of local) {
    if (!ledger.has(f)) pending.push(f);
    else if (ledger.get(f) !== sum) drifted.push(f);
  }

  // Clean: every tracked migration is recorded and unchanged. Stay quiet —
  // success is the silent default. (Stray-dir notes are housekeeping, not drift;
  // they only surface alongside a real finding below.)
  if (pending.length === 0 && drifted.length === 0) return 0;

  const apply = `${C.dim}aidream:${C.reset} python db/apply_migrations.py --source ${SOURCE}`;

  // Unapplied is the real emergency (a file never ran) → [FAIL] red.
  // Drift-only is recorded-but-edited → [WARN] yellow. Never scream "unapplied"
  // when nothing is unapplied.
  if (pending.length) {
    console.log(
      `${TAG.fail}Migrations: ${pending.length} unapplied — the DB does not match this repo. ` +
        `${strict ? "(--strict: blocking)" : "(non-blocking)"}`,
    );
    console.log();
    for (const f of pending) console.log(`  ${C.red}✗ ${f}${C.reset}`);
    if (drifted.length)
      for (const f of drifted)
        console.log(
          `  ${C.yellow}~ ${f}${C.reset} ${C.dim}(drifted)${C.reset}`,
        );
    console.log();
    console.log(
      `  ${C.dim}A file on disk runs nothing until applied + recorded. Apply from${C.reset} ${apply}`,
    );
  } else {
    console.log(
      `${TAG.warn}Migrations: ${drifted.length} drifted — recorded, but the file changed since. (non-blocking)`,
    );
    console.log();
    for (const f of drifted) console.log(`  ${C.yellow}~ ${f}${C.reset}`);
    console.log();
    console.log(`  ${C.dim}Re-apply or re-record from${C.reset} ${apply}`);
  }

  const strayNotes = STRAY_DIRS.map((d) => ({
    d,
    n: listSql(resolve(ROOT, d)).length,
  })).filter((x) => x.n > 0);
  if (strayNotes.length) {
    const total = strayNotes.reduce((s, x) => s + x.n, 0);
    console.log();
    console.log(
      `  ${C.dim}note: ${total} stray .sql outside migrations/ (${strayNotes.map((x) => x.d).join(", ")}) — consider consolidating${C.reset}`,
    );
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
