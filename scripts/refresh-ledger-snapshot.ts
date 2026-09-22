#!/usr/bin/env npx tsx
/**
 * `pnpm refresh:ledger-snapshot` — rewrite `migrations/LEDGER.json` from the PRODUCTION
 * migration ledger. SELECT-ONLY: it opens one connection, reads
 * `public._schema_migrations`, and writes a file. It never writes the database.
 *
 * WHO RUNS IT. The nightly catch-up step (scripts/night/clone-catchup.sh) runs it once
 * per night so the snapshot is never more than a day behind what production holds,
 * including applies made from the OTHER repo or another machine. `pnpm db:apply` keeps
 * it current in between by recording the single row it just ledgered — so the snapshot
 * on this machine is never older than the last apply from this machine.
 *
 * WHAT IT RECORDS. One entry per file that (a) exists under migrations/campaign or
 * migrations/inverse in this checkout and (b) has a ledger row on production. The key is
 * the repo-relative path, because that is what a git hook has in its hand. Rows are
 * matched by FILENAME across every ledger source: the campaign selector writes
 * source='campaign', the plain runner writes source='matrx-frontend', and aidream's
 * runner writes its own labels into the same table on the same database — a file is
 * frozen because PRODUCTION RAN IT, not because of which label recorded it.
 *
 * REHEARSAL ROWS ARE NOT PRODUCTION ROWS. A row carrying `rehearsal_on` was written
 * against the dev clone and is skipped; the clone is a physical restore of production's
 * cluster, so its ledger is production's plus those marks.
 *
 *   pnpm refresh:ledger-snapshot            rewrite the snapshot
 *   pnpm refresh:ledger-snapshot --check    exit 1 if the snapshot would change (no write)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { connectDirect, loadDbEnv, type DbEnv } from "./lib/direct-db";
import {
  REPO_ROOT,
  SNAPSHOT_PATH,
  SNAPSHOT_REL,
  emptySnapshot,
  readSnapshot,
  writeSnapshot,
} from "./lib/ledger-snapshot.mjs";

const GUARDED = ["migrations/campaign", "migrations/inverse"];

function filesOnDisk(): Map<string, string> {
  /** basename -> repo-relative path. */
  const out = new Map<string, string>();
  for (const dir of GUARDED) {
    const abs = join(REPO_ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (!name.endsWith(".sql")) continue;
      // A basename that exists in BOTH dirs would be ambiguous. It does not today, and
      // if it ever does the first one wins and the other is reported rather than
      // silently dropped — a file missing from the snapshot is a file nothing freezes.
      if (out.has(name)) {
        console.warn(`! ${name} exists in more than one guarded directory; keeping ${out.get(name)}`);
        continue;
      }
      out.set(name, `${dir}/${name}`);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const check = process.argv.includes("--check");
  const env = loadDbEnv();
  if (!("host" in env)) {
    console.error(
      `Cannot reach the production ledger — missing ${(env as { missing: string[] }).missing.join(", ")}.\n` +
        `Nothing was written; ${SNAPSHOT_REL} is unchanged.`,
    );
    return 2;
  }
  const onDisk = filesOnDisk();
  const client = await connectDirect(env as DbEnv, "refresh-ledger-snapshot (read-only)");
  let rows: { source: string; filename: string; checksum: string; applied_at: string }[];
  try {
    const hasRehearsal = await client.query<{ present: boolean }>(
      `select exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = '_schema_migrations'
                         and column_name = 'rehearsal_on') as present`,
    );
    const rehearsalFilter = hasRehearsal.rows[0]?.present ? `where rehearsal_on is null` : ``;
    const res = await client.query<{ source: string; filename: string; checksum: string; applied_at: string }>(
      `select source, filename, checksum, applied_at::text as applied_at
         from public._schema_migrations ${rehearsalFilter}
        order by applied_at`,
    );
    rows = res.rows;
  } finally {
    await client.end().catch(() => undefined);
  }

  const next = emptySnapshot();
  let matched = 0;
  for (const row of rows) {
    const rel = onDisk.get(row.filename);
    if (!rel) continue;
    // Later rows win: the ledger's (source, filename) is unique, so a duplicate here is
    // the same file recorded under two labels, and the most recent apply is the truth.
    next.files[rel] = {
      source: row.source,
      filename: row.filename,
      checksum: row.checksum,
      applied_at: row.applied_at,
    };
    matched++;
  }

  const before = readSnapshot(SNAPSHOT_PATH);
  const beforeFiles = before.ok ? JSON.stringify(before.snapshot.files) : null;
  const afterFiles = JSON.stringify(
    Object.fromEntries(Object.keys(next.files).sort().map((k) => [k, next.files[k]])),
  );
  const changed = beforeFiles !== afterFiles;

  if (check) {
    console.log(
      changed
        ? `[FAIL] ${SNAPSHOT_REL} is stale — ${Object.keys(next.files).length} production row(s) map onto this tree.`
        : `[OK] ${SNAPSHOT_REL} matches production (${Object.keys(next.files).length} file(s)).`,
    );
    return changed ? 1 : 0;
  }

  next.generated_at = new Date().toISOString();
  writeSnapshot(next, SNAPSHOT_PATH);
  console.log(
    `[OK] ${SNAPSHOT_REL} written — ${matched} of ${onDisk.size} campaign/inverse file(s) on disk ` +
      `have a production ledger row (${rows.length} rows read).${changed ? "" : " (no change)"}`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`refresh:ledger-snapshot failed — ${err?.message ?? err}`);
    process.exit(2);
  },
);
