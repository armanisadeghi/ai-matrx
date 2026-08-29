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
/** A live CHECK constraint mentioning organization_id — the EVIDENCE half of an
 *  exemption. Added to the snapshot 2026-08-29 (migration
 *  migrations/org_null_ratchet_constraint_evidence.sql). */
interface OrgConstraint {
  schema: string;
  table: string;
  constraint: string;
  definition: string;
}
interface OrgNullSnapshot {
  generated_at: string;
  system_org_id: string;
  ddl_guard_attached: boolean;
  null_org_rows_total: number;
  null_org_rows: NullRow[];
  nullable_org_columns: { schema: string; table: string }[];
  org_constraints?: OrgConstraint[];
}
interface KnownWriter {
  table: string;
  reason: string;
}
/** A table where NULL is not debt but the SHAPE THE DATABASE DEMANDS. */
interface OrgLessByConstraint {
  table: string;
  /** The live CHECK constraint that forces it. Verified against the catalog on
   *  every run — an exemption whose constraint is gone is not an exemption. */
  constraint: string;
  reason: string;
}
interface Baseline {
  _comment: string;
  seeded_at: string;
  null_org_rows_total: number;
  /** Per-table NULL-org counts. Growth is judged PER TABLE, so the gate can name
   *  the table that regressed instead of only a total that moved. */
  null_org_rows_by_table: Record<string, number>;
  nullable_org_columns: string[];
  /**
   * Tables with a LIVE write path still minting NULL-org rows. Their growth is
   * reported RED and never blocks — see readBaseline() for why this file exists
   * at all, and why a reason is mandatory.
   */
  known_null_org_writers: KnownWriter[];
  /**
   * Tables where a NULL organization_id is REQUIRED by a live CHECK constraint
   * — see honourExemptions() for the full reasoning and why this is not just
   * another allowlist.
   */
  org_less_by_constraint?: OrgLessByConstraint[];
}

const key = (t: { schema: string; table: string }) => `${t.schema}.${t.table}`;

/**
 * THE KNOWN-WRITER ALLOWLIST, and why a ratchet needs one.
 *
 * A row count taken at an instant is only a stable baseline if nothing is
 * appending. Three tables WERE at seeding; two of them —
 * `users.user_secret_audit` and `transcripts.studio_recording_chunks` — were
 * fixed on 2026-08-21 and left the list the only way a table may (by being
 * fixed), leaving `ops.system_error`. Left alone a live writer would fail
 * EVERY release forever — which is precisely the failure
 * mode the ruling's own constraint forbids, a gate that blocks on the legacy
 * backlog instead of on new defects.
 *
 * So growth splits in two. On an allowlisted table it is printed RED and does
 * not block; anywhere else it blocks. A REASON IS REQUIRED per entry (the
 * script exits 2 without one) — same contract as
 * unregistered-entities-allowlist.json, and for the same reason: this file is
 * the record that the exception was reviewed, not the exception itself. An
 * entry is removed when the write path is fixed, never to quiet a gate.
 */
/**
 * THE CONSTRAINT-BACKED EXEMPTION, and why it is not "the allowlist again".
 *
 * Five tables in this ratchet's scan set do not use `organization_id` as an
 * OWNER column at all, and a live CHECK constraint says so in SQL:
 *
 *   platform.retention_policy      scope selector — 'global'/'taxonomy_node'/
 *                                  'entity' policies REQUIRE org IS NULL
 *   platform.entity_grants         grant TARGET — 'global'/'industry' audiences
 *                                  REQUIRE org IS NULL
 *   users.integration_connections  XOR owner — owner_type='user' REQUIRES NULL
 *   users.user_secrets             XOR owner — a personal secret REQUIRES NULL
 *   users.credential_items         XOR owner — same
 *
 * On these, "fixing" a row by stamping an org does not produce a better row; it
 * produces a CHECK VIOLATION. Counting them as debt made the ratchet's number
 * grow every time a user saved a personal credential — a gate that cries wolf
 * is a gate somebody eventually mutes, which is the exact failure this whole
 * ratchet exists to prevent.
 *
 * 🚨 An exemption is only as good as its EVIDENCE. A plain allowlist is an
 * assertion ("trust me"), and assertions rot in silence: drop the constraint in
 * some unrelated migration and the entry keeps excusing real debt forever —
 * the silent-green pathology moved one layer down. So every entry NAMES the
 * constraint it rests on, and this function checks that constraint against the
 * live catalog (`org_constraints`, from the snapshot RPC) on EVERY run. A
 * missing constraint does not quietly downgrade to "still exempt": it SCREAMS,
 * and in --strict it blocks. Human judgement supplies the reason; the database
 * supplies the premise; neither is trusted on its own.
 *
 * An entry is removed when the table's design changes, never to quiet a gate.
 */
function honourExemptions(
  base: Baseline,
  snap: OrgNullSnapshot,
): { honoured: Map<string, OrgLessByConstraint>; broken: OrgLessByConstraint[] } {
  const claimed = base.org_less_by_constraint ?? [];
  const live = new Set(
    (snap.org_constraints ?? []).map((c) => `${c.schema}.${c.table}:${c.constraint}`),
  );
  const honoured = new Map<string, OrgLessByConstraint>();
  const broken: OrgLessByConstraint[] = [];
  for (const e of claimed) {
    if (live.has(`${e.table}:${e.constraint}`)) honoured.set(e.table, e);
    else broken.push(e);
  }
  return { honoured, broken };
}

function readBaseline(): Baseline {
  const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  const writers = base.known_null_org_writers ?? [];
  // Same reason-required contract as the writers list, for the same reason:
  // the file is the record that an exception was REVIEWED, not the exception.
  const badExempt = (base.org_less_by_constraint ?? []).filter(
    (e) => !e.table || !e.constraint || !e.reason || e.reason.trim().length < 12,
  );
  if (badExempt.length) {
    console.error(
      `${C.red}[FAIL]${C.reset} org_less_by_constraint entries missing a table, constraint, or real reason: ${badExempt.map((e) => e.table || "?").join(", ")}`,
    );
    console.error(
      `  ${C.dim}Every exemption must NAME the CHECK constraint that forces the NULL — that named constraint is what gets verified live.${C.reset}`,
    );
    process.exit(2);
  }
  const bad = writers.filter((w) => !w.table || !w.reason || w.reason.trim().length < 12);
  if (bad.length) {
    console.error(
      `${C.red}[FAIL]${C.reset} known_null_org_writers entries without a real reason: ${bad.map((w) => w.table).join(", ")}`,
    );
    console.error(
      `  ${C.dim}A reason is the whole point of this list — it is the "reviewed, known live writer" record, not a mute button.${C.reset}`,
    );
    process.exit(2);
  }
  return { ...base, known_null_org_writers: writers };
}

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
  const known = new Map(base.known_null_org_writers.map((w) => [w.table, w.reason]));
  const { honoured, broken } = honourExemptions(base, snap);
  // Growth never blocks when it is attributable to a KNOWN live writer, or to a
  // table whose NULL is demanded by a live CHECK constraint. Everything else does.
  const unexplained = snap.null_org_rows
    .map((r) => ({ ref: key(r), delta: r.null_rows - (base.null_org_rows_by_table[key(r)] ?? 0) }))
    .filter((r) => r.delta > 0 && !known.has(r.ref) && !honoured.has(r.ref));
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

  // 🚨 A claimed exemption whose CHECK constraint is GONE is not an exemption —
  // it is unexcused debt wearing an excuse, and it must be louder than the debt
  // itself. This is the assertion that stops the exemption list from becoming
  // the next silent green.
  if (broken.length) {
    console.log("");
    console.log(
      `  ${STRICT ? `${C.red}[FAIL]` : `${C.yellow}[WARN]`}${C.reset} ${C.bold}NO NULL ORG EXEMPTION BROKEN${C.reset} — ` +
        `${broken.length} table(s) claim a constraint that no longer exists:`,
    );
    for (const e of broken) {
      console.log(`  ${C.red}  ${e.table}${C.reset} ${C.dim}claims${C.reset} ${e.constraint} ${C.dim}— not in the live catalog${C.reset}`);
    }
    console.log(
      `  ${C.cyan}     Either the constraint was dropped (the table is now real debt — remove the${C.reset}`,
    );
    console.log(
      `  ${C.cyan}     exemption and fix the writer) or it was renamed (re-point the entry).${C.reset}`,
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
      // Exempt tables stay VISIBLE and labelled with the constraint that
      // justifies them — an exemption you cannot see is indistinguishable from
      // a gate that forgot to look.
      const live = known.has(key(r))
        ? `  ${C.red}LIVE WRITER${C.reset}`
        : honoured.has(key(r))
          ? `  ${C.dim}by-constraint: ${honoured.get(key(r))!.constraint}${C.reset}`
          : "";
      console.log(`  ${mark} ${key(r).padEnd(46)} ${String(r.null_rows).padStart(8)}${live}`);
    }
  }
  console.log(
    `  ${C.bold}${snap.null_org_rows_total}${C.reset} NULL-org row(s)  ·  baseline ${C.bold}${base.null_org_rows_total}${C.reset}`,
  );
  if (rowGrowth > 0) {
    // A known live writer is still a VIOLATION and still prints red; it just
    // may not hold a release hostage while its own fix is queued.
    blocking = blocking || (STRICT && unexplained.length > 0);
    console.log("");
    // The headline counts what is actually WRONG. Leading with raw growth when
    // most of it is constraint-mandated is how a gate teaches people to ignore
    // it — the same cry-wolf dynamic that let 136 rows accumulate behind a
    // green badge. Raw growth is still printed, just not as the accusation.
    const unexplainedRows = unexplained.reduce((n, u) => n + u.delta, 0);
    if (unexplainedRows > 0) {
      console.log(
        `${STRICT ? C.red : C.yellow}${C.bold}  NO NULL ORG VIOLATED — ${unexplainedRows} NEW unexplained NULL-org row(s) since the baseline.${C.reset}`,
      );
      console.log(
        `  ${C.dim}(${rowGrowth} total new; the remainder is accounted for below.)${C.reset}`,
      );
    } else {
      console.log(
        `  ${C.green}${C.bold}No unexplained NULL-org growth.${C.reset} ${C.dim}${rowGrowth} new row(s), every one accounted for below.${C.reset}`,
      );
    }
    for (const [table, reason] of known) {
      console.log(`  ${C.red}known live writer:${C.reset} ${table}`);
      console.log(`  ${C.dim}    ${reason.slice(0, 150)}…${C.reset}`);
    }
    // Growth on a constraint-backed table is not a violation at all — it is the
    // table working. Named, with its verified constraint, so the number is
    // explained rather than merely absorbed.
    const byConstraint = snap.null_org_rows
      .map((r) => ({ ref: key(r), delta: r.null_rows - (base.null_org_rows_by_table[key(r)] ?? 0) }))
      .filter((r) => r.delta > 0 && honoured.has(r.ref));
    for (const b of byConstraint) {
      console.log(
        `  ${C.dim}by-constraint (verified live):${C.reset} ${b.ref} +${b.delta} ${C.dim}— ${honoured.get(b.ref)!.constraint}${C.reset}`,
      );
    }
    if (!unexplained.length) {
      console.log(
        `  ${C.dim}Every new row is a KNOWN live writer or a verified by-constraint table. Not blocking.${C.reset}`,
      );
    } else {
      for (const u of unexplained) console.log(`  ${C.red}unexplained: ${u.ref} +${u.delta}${C.reset}`);
      // The fix hint belongs with an actual defect. Printing it under a clean
      // by-constraint report would tell the reader to "fix" rows the database
      // requires to be exactly as they are.
      console.log(`  ${C.cyan}fix: find the write path and give the row its organization. System/global/builtin${C.reset}`);
      console.log(`  ${C.cyan}     content → the system org (${snap.system_org_id}). User content → the creator's${C.reset}`);
      console.log(`  ${C.cyan}     personal org (public.ensure_personal_organization), or attach the${C.reset}`);
      console.log(`  ${C.cyan}     public._stamp_org_default backstop. NULL is never the answer. (db-rules §2.)${C.reset}`);
    }
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
  const base = readBaseline();

  if (UPDATE) {
    const liveCols = snap.nullable_org_columns.map(key).sort();
    // A ratchet only ever tightens — per table, so shrinking one table can never
    // silently buy headroom for another that grew.
    const { honoured: exempt } = honourExemptions(base, snap);
    const byTable: Record<string, number> = { ...base.null_org_rows_by_table };
    for (const r of snap.null_org_rows) {
      const ref = key(r);
      // A by-constraint table's NULL count is not debt — it rises whenever a
      // user saves a personal credential. Pinning it to a historical low would
      // manufacture permanent phantom growth and re-teach everyone to scroll
      // past this gate, so those track CURRENT. Everything else only ratchets
      // DOWN, and a broken exemption blocks before this line is ever reached.
      byTable[ref] = exempt.has(ref)
        ? r.null_rows
        : Math.min(byTable[ref] ?? Number.POSITIVE_INFINITY, r.null_rows);
    }
    for (const ref of Object.keys(byTable)) {
      if (!snap.null_org_rows.some((r) => key(r) === ref)) delete byTable[ref]; // fixed to zero
    }
    const next: Baseline = {
      ...base,
      seeded_at: snap.generated_at,
      null_org_rows_total: Object.values(byTable).reduce((a, b) => a + b, 0),
      null_org_rows_by_table: byTable,
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
    const known = new Set(base.known_null_org_writers.map((w) => w.table));
    // Same exemption rules as the human report, so --json and the printed
    // verdict can never disagree about what counts as growth.
    const { honoured, broken } = honourExemptions(base, snap);
    const grew =
      snap.null_org_rows.some(
        (r) =>
          !known.has(key(r)) &&
          !honoured.has(key(r)) &&
          r.null_rows > (base.null_org_rows_by_table[key(r)] ?? 0),
      ) ||
      [...liveCols].some((c) => !base.nullable_org_columns.includes(c)) ||
      broken.length > 0;
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
