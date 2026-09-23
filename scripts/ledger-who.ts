#!/usr/bin/env npx tsx
/**
 * `pnpm ledger:who <filename>` — WHO APPLIED THIS LEDGER ROW (lane LEDGER-LANE, 2026-09-23).
 *
 * Prints, for every `public._schema_migrations` row with that filename (any source unless
 * `--source` names one): when it landed (UTC and Pacific), whether that was inside the 1–4 AM
 * Pacific window, the chair step it carried, the attribution the runner wrote (lane, OS user,
 * host, session, process chain, git HEAD), and the attribution inside every rebase receipt.
 * A row written before the attribution columns existed says so in words — it is never guessed.
 *
 * READ-ONLY on every target: the session is `default_transaction_read_only = on` before the one
 * SELECT runs. `--target production` (the default) | `branch` | `clone`.
 *
 * Twin: `uv run python db/ledger_who.py <filename>` in aidream (same fields, same words).
 */
import { basename } from "node:path";
import process from "node:process";
import type pg from "pg";
import { connectDirect, loadDbEnv, type DbEnv } from "./lib/direct-db";
import {
  cloneRefOverride,
  loadBranchDbEnv,
  loadBranchRef,
  loadCloneDbEnv,
  loadCloneRef,
  parseTargetFlag,
  type Target,
} from "./lib/migration-target";

const ROOT = process.cwd();

/** A read-only connection to the named target, announced. Never a write path. */
export async function connectReadOnly(target: Target, why: string): Promise<pg.Client> {
  let env: DbEnv;
  if (target === "branch") env = { ...loadBranchDbEnv(ROOT, loadBranchRef(ROOT)) };
  else if (target === "clone") env = { ...loadCloneDbEnv(ROOT, loadCloneRef(ROOT, cloneRefOverride(process.argv.slice(2)))) };
  else {
    const e = loadDbEnv();
    if ("missing" in e) throw new Error(`missing ${e.missing.join(", ")} (looked in ${e.looked.join(", ")})`);
    env = e;
  }
  const client = await connectDirect(env, why);
  await client.query("set default_transaction_read_only = on");
  return client;
}

/** 01:00–04:00 America/Los_Angeles, inclusive — the same rule the runner and the column use. */
export const PT_HHMM_SQL = (col: string) =>
  `to_char(${col} at time zone 'America/Los_Angeles', 'HH24MI')::int`;

function pacific(ts: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(ts);
}

type Row = Record<string, unknown> & { source: string; filename: string; applied_at: Date; pt_hhmm: number };

export function describeRow(r: Row): string[] {
  const inWindow = r.pt_hhmm >= 100 && r.pt_hhmm <= 400;
  const col = (k: string) => (r[k] === undefined ? undefined : (r[k] as string | boolean | null));
  const hasColumns = col("applied_by_os_user") !== undefined;
  const out = [
    `${r.source}/${r.filename}`,
    `  checksum      ${String(r.checksum)}`,
    `  applied_at    ${r.applied_at.toISOString()}  (${pacific(r.applied_at)})`,
    `  window        ${inWindow ? "INSIDE" : "OUTSIDE"} the 1–4 AM Pacific window` +
      (col("applied_in_window") !== undefined && col("applied_in_window") !== null
        ? ` (the runner recorded applied_in_window = ${String(col("applied_in_window"))})`
        : ``),
    `  duration_ms   ${String(r.duration_ms)}`,
  ];
  if (r.chair_step) out.push(`  chair_step    ${String(r.chair_step)}`);
  if (r.rehearsal_on) out.push(`  rehearsal_on  ${String(r.rehearsal_on)}`);
  if (!hasColumns) {
    out.push(
      `  attribution   NONE — this ledger has no attribution columns yet ` +
        `(migrations/campaign/ledgerlane_a_ledger_row_names_who_applied_it.sql adds them)`,
    );
  } else if (col("applied_by_os_user") === null) {
    out.push(`  attribution   NONE — the row was written before the runner recorded who applied it (never backfilled)`);
  } else {
    out.push(`  lane          ${col("applied_by_lane") ?? "(no lane named)"}`);
    out.push(`  os user       ${col("applied_by_os_user")}`);
    out.push(`  host          ${col("applied_by_host")}`);
    out.push(`  session       ${col("applied_by_session") ?? "(none in the environment)"}`);
    out.push(`  git head      ${col("applied_from_git_head")}`);
    out.push(`  process       ${col("applied_by_process") ?? "(unreadable)"}`);
  }
  const receipts = Array.isArray(r.rebase_receipts) ? (r.rebase_receipts as Array<Record<string, unknown>>) : [];
  for (const [i, rc] of receipts.entries()) {
    const a = (rc.attribution ?? null) as Record<string, unknown> | null;
    out.push(
      `  rebase #${i + 1}     ${String(rc.rebased_at)} ${String(rc.target)} lane ${String(rc.lane ?? "(none)")} ` +
        `${String(rc.was ?? "").slice(0, 12)} -> ${String(rc.now ?? "").slice(0, 12)}` +
        (a
          ? ` — ${String(a.os_user)}@${String(a.host)}${a.session ? `, ${String(a.session)}` : ""}, ` +
            `${a.in_window ? "inside" : "outside"} the window, git ${String(a.git_head)}`
          : ` — no attribution in this receipt (written before LEDGER-LANE)`),
    );
  }
  return out;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const valueOf = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] ?? null : (argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1) ?? null);
  };
  const flagValues = new Set([valueOf("--target"), valueOf("--source"), valueOf("--clone-ref")]);
  const positional = argv.filter((a) => !a.startsWith("--") && !flagValues.has(a));
  if (positional.length !== 1) {
    console.error("usage: pnpm ledger:who <filename.sql> [--target production|branch|clone] [--source <source>]");
    return 2;
  }
  const filename = basename(positional[0]!);
  const target = parseTargetFlag(argv);
  const source = valueOf("--source");
  const client = await connectReadOnly(target, "ledger:who (read-only)");
  try {
    const r = await client.query<{ j: Record<string, unknown>; pt_hhmm: number }>(
      `select to_jsonb(m) as j, ${PT_HHMM_SQL("m.applied_at")} as pt_hhmm
         from public._schema_migrations m
        where m.filename = $1 and ($2::text is null or m.source = $2)
        order by m.applied_at`,
      [filename, source],
    );
    if (!r.rows.length) {
      console.log(`${filename}: no ledger row at --target ${target}${source ? ` for source ${source}` : ""}.`);
      return 1;
    }
    console.log(`ledger:who — --target ${target} (read-only)`);
    for (const row of r.rows) {
      const j = row.j;
      const merged = { ...j, applied_at: new Date(String(j.applied_at)), pt_hhmm: row.pt_hhmm } as Row;
      console.log(describeRow(merged).join("\n"));
    }
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && /ledger-who\.ts$/.test(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`ledger:who failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    },
  );
}
