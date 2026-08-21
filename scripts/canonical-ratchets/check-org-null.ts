#!/usr/bin/env tsx
/**
 * RATCHET 3+4 — NO NULL ORG. BLOCKING.
 *
 * Owner ruling, 2026-08-21 (db-rules FEATURE.md §2, "NO NULL ORG"):
 *
 *   "If something belongs to the system, that CANNOT EVER be represented by a
 *    NULL org! Write checks that will scream and paint everything RED if anyone
 *    does that ... make the release script scream ... NO NULL ORG."
 *
 * NULL is not a scope. System/global/builtin content belongs to the system org
 * (`matrx-system`, 39c38960-d30c-4840-b0c1-c9960de95582, `global_readable`);
 * user content falls back to the creator's personal org. This is the DATA and
 * SCHEMA half of the enforcement — `platform._ddl_guard` lane (e) is the DDL
 * half, and it fires at creation time, before a row exists to be wrong.
 *
 * TWO RATCHETS, ONE SNAPSHOT (`public.org_null_ratchet_snapshot()`, ~1s,
 * service_role only). They are one command because they are one RPC call and
 * one story; they fail independently.
 *
 *   ROWS    — total rows with organization_id IS NULL across every nullable-org
 *             table. May only go DOWN. This is what stops the grandfathered
 *             backlog from GROWING while it waits its turn: the NOT NULL flip
 *             is not forced, but writing a NEW NULL-org row fails the release.
 *   COLUMNS — the set of tables that still ALLOW a NULL organization_id. A
 *             committed baseline; a table that is NEW to the set fails. This is
 *             the one that can never be argued down, because nothing legitimate
 *             creates a nullable org column any more.
 *
 * Why the COLUMNS half is a SET and not a count: unlike the unregistered-tables
 * ratchet, membership here is the actionable fact and the population is small
 * and named. A set-diff tells you exactly which table regressed instead of
 * making you go find it.
 *
 * `history` is excluded from the ROWS scan — see the migration header
 * (migrations/org_null_ratchet_snapshot.sql). A history.row_versions row is a
 * snapshot of a row already counted at its source; counting it double-counts,
 * and makes ordinary edits of legacy rows grow the number and fail the gate.
 *
 *   pnpm check:org-null            # loud, exit 0 (advisory)
 *   pnpm check:org-null --strict   # exit 1 on growth (release gate)
 *   pnpm check:org-null --update-baseline
 *   pnpm check:org-null --json
 *
 * Exit codes: 0 pass / advisory / creds absent · 1 growth in --strict · 2 unreadable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { C, loadEnv, rpc } from "./snapshot";

const BASELINE_PATH = resolve(import.meta.dirname, "org-null-baseline.json");

const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");
const UPDATE = process.argv.includes("--update-baseline");

interface NullRow {
  schema: string;
  table: string;
  null_rows: number;
  /** true when the DDL guard's entity-looking-or-registered test also matches. */
  guarded_class: boolean;
}
interface OrgNullSnapshot {
  generated_at: string;
  system_org_id: string;
  ddl_guard_attached: boolean;
  null_org_rows_total: number;
  null_org_rows: NullRow[];
  nullable_org_columns: { schema: string; table: string }[];
}
interface Baseline {
  _comment: string;
  seeded_at: string;
  null_org_rows_total: number;
  nullable_org_columns: string[];
}

const key = (t: { schema: string; table: string }) => `${t.schema}.${t.table}`;

async function pull(): Promise<OrgNullSnapshot | null> {
  const env = loadEnv();
  if (!env) {
    console.error(
      `${C.yellow}[WARN]${C.reset} NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY absent — NO NULL ORG ratchet not measured.`,
    );
    return null;
  }
  try {
    return (await rpc("org_null_ratchet_snapshot", env.url, env.key)) as OrgNullSnapshot;
  } catch (err) {
    console.error(`${C.yellow}[WARN]${C.reset} could not reach Supabase: ${String(err)}`);
    return null;
  }
}

function report(snap: OrgNullSnapshot, base: Baseline): boolean {
  const liveCols = snap.nullable_org_columns.map(key).sort();
  const baseCols = new Set(base.nullable_org_columns);
  const newCols = liveCols.filter((c) => !baseCols.has(c));
  const fixedCols = [...baseCols].filter((c) => !liveCols.includes(c)).sort();
  const rowGrowth = snap.null_org_rows_total - base.null_org_rows_total;
  let blocking = false;

  console.log("");
  console.log(`${C.bold}  NO NULL ORG (ratchet)${C.reset}   ${C.dim}owner ruling 2026-08-21 · db-rules §2/§6e${C.reset}`);
  console.log(`  ${C.dim}live snapshot ${snap.generated_at} · system org ${snap.system_org_id}${C.reset}`);

  // The guard is the layer that stops NEW nullable-org tables at birth. If it is
  // not bound, this ratchet is measuring a door nobody is watching (db-rules §1:
  // pg_event_trigger is the only proof, and a project restore drops bindings).
  if (!snap.ddl_guard_attached) {
    console.log(
      `  ${STRICT ? `${C.red}[FAIL]` : `${C.yellow}[WARN]`}${C.reset} the ${C.bold}ddl_guard${C.reset} event trigger is NOT attached/enabled — ` +
        `lane (e) is not blocking nullable-org table births.`,
    );
    if (STRICT) blocking = true;
  }
  console.log("");

  // ── ROWS ──────────────────────────────────────────────────────────────────
  console.log(`  ${C.bold}rows with organization_id IS NULL${C.reset}`);
  if (snap.null_org_rows.length === 0) {
    console.log(`  ${C.green}  none — every row on every table has a real organization.${C.reset}`);
  } else {
    for (const r of snap.null_org_rows.sort((a, b) => b.null_rows - a.null_rows)) {
      const mark = r.guarded_class ? `${C.yellow}!${C.reset}` : `${C.dim}·${C.reset}`;
      console.log(`  ${mark} ${key(r).padEnd(46)} ${String(r.null_rows).padStart(8)}`);
    }
  }
  console.log(
    `  ${C.bold}${snap.null_org_rows_total}${C.reset} NULL-org row(s)  ·  baseline ${C.bold}${base.null_org_rows_total}${C.reset}`,
  );
  if (rowGrowth > 0) {
    blocking = blocking || STRICT;
    console.log("");
    console.log(
      `${STRICT ? C.red : C.yellow}${C.bold}  NO NULL ORG VIOLATED — ${rowGrowth} NEW NULL-org row(s) since the baseline.${C.reset}`,
    );
    console.log(`  ${C.cyan}fix: find the write path and give the row its organization. System/global/builtin${C.reset}`);
    console.log(`  ${C.cyan}     content → the system org (${snap.system_org_id}). User content → the creator's${C.reset}`);
    console.log(`  ${C.cyan}     personal org (public.ensure_personal_organization), or attach the${C.reset}`);
    console.log(`  ${C.cyan}     public._stamp_org_default backstop. NULL is never the answer. (db-rules §2.)${C.reset}`);
  } else if (rowGrowth < 0) {
    console.log(`  ${C.green}${-rowGrowth} fewer than baseline — shrink it: pnpm check:org-null --update-baseline${C.reset}`);
  } else {
    console.log(`  ${C.green}At baseline. No new NULL-org rows.${C.reset}`);
  }

  // ── COLUMNS ───────────────────────────────────────────────────────────────
  console.log("");
  console.log(
    `  ${C.bold}tables that still ALLOW a NULL organization_id${C.reset}  ` +
      `${C.dim}${liveCols.length} live · ${base.nullable_org_columns.length} baseline${C.reset}`,
  );
  if (newCols.length) {
    blocking = blocking || STRICT;
    console.log("");
    for (const c of newCols) console.log(`  ${C.red}+ ${c}${C.reset}  ${C.dim}NEW — not in the baseline${C.reset}`);
    console.log("");
    console.log(
      `${STRICT ? C.red : C.yellow}${C.bold}  NO NULL ORG VIOLATED — ${newCols.length} table(s) gained a nullable organization_id.${C.reset}`,
    );
    console.log(`  ${C.cyan}fix: ALTER COLUMN organization_id SET NOT NULL, and attach the backstop${C.reset}`);
    console.log(`  ${C.cyan}     (public._stamp_org_default or platform.inherit_org_from_parent) in the SAME${C.reset}`);
    console.log(`  ${C.cyan}     migration — db-rules §2 law. The baseline may only SHRINK.${C.reset}`);
  } else if (fixedCols.length) {
    for (const c of fixedCols) console.log(`  ${C.green}- ${c}${C.reset}  ${C.dim}FIXED${C.reset}`);
    console.log(`  ${C.green}${fixedCols.length} fixed — shrink the baseline: pnpm check:org-null --update-baseline${C.reset}`);
  } else {
    console.log(`  ${C.green}At baseline. No table gained a nullable organization_id.${C.reset}`);
  }
  console.log("");
  return blocking;
}

async function main(): Promise<number> {
  const snap = await pull();
  if (!snap) return 0;
  const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

  if (UPDATE) {
    const liveCols = snap.nullable_org_columns.map(key).sort();
    const next: Baseline = {
      ...base,
      seeded_at: snap.generated_at,
      // A ratchet only ever tightens. Refuse to record growth as the new normal.
      null_org_rows_total: Math.min(base.null_org_rows_total, snap.null_org_rows_total),
      nullable_org_columns: base.nullable_org_columns.filter((c) => liveCols.includes(c)),
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(
      `${C.green}baseline updated: rows ${base.null_org_rows_total} → ${next.null_org_rows_total}, ` +
        `columns ${base.nullable_org_columns.length} → ${next.nullable_org_columns.length}${C.reset}`,
    );
    return 0;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ baseline: base, snapshot: snap }, null, 2));
    const liveCols = new Set(snap.nullable_org_columns.map(key));
    const grew =
      snap.null_org_rows_total > base.null_org_rows_total ||
      [...liveCols].some((c) => !base.nullable_org_columns.includes(c));
    return STRICT && grew ? 1 : 0;
  }

  const blocking = report(snap, base);
  if (!STRICT) return 0;
  return blocking ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}[ERROR]${C.reset} ${String(err)}`);
    process.exit(2);
  },
);
