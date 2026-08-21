#!/usr/bin/env tsx
/**
 * RATCHET 2 — post-doctrine conformance. BLOCKING.
 *
 * THE RULE THIS ENFORCES: a table born AFTER the canonical doctrine was ratified
 * (2026-08-12) may not be born non-conformant. The legacy queue stays a queue —
 * ~913 `iam.verify_canonical` FAILs across 171 tables are a backlog nobody can
 * clear in one release, and blocking on them would block every release forever.
 * But a table created today has no excuse: `platform.create_entity_table` +
 * `iam.apply_rls` generate a conformant table, so a new FAIL means someone
 * hand-rolled one.
 *
 * HOW "CREATED AFTER" IS DETERMINED — and why it is this and nothing else.
 * `platform.entity_types` carries NO registration timestamp (no created_at
 * column), so registration cannot date a table. The only machine-readable birth
 * record in this database is the DDL sentinel's log:
 *
 *     min(occurred_at) FROM platform.ddl_guard_log
 *     WHERE command_tag = 'CREATE TABLE' AND object_ref = '<schema>.<table>'
 *
 * That is the heuristic, applied inside `public.canonical_ratchet_snapshot()`
 * (ledgered as migrations/canonical_ratchet_snapshot.sql, where it is spelled
 * out again next to the SQL). It is a FLOOR, not a census, with two blind spots
 * this gate states out loud rather than absorbing:
 *
 *   1. The log itself starts 2026-08-13 00:46 UTC — earliest recorded CREATE
 *      TABLE 06:15. Anything born in the ~25h between the cutoff and the first
 *      log row reads as legacy. There is no second signal to close it with.
 *   2. `ddl_guard` is an EVENT TRIGGER, and a project restore silently drops
 *      event triggers (db-rules FEATURE.md change log, 2026-08-20 — this
 *      already happened once to all five platform event triggers). A dropped
 *      guard means births stop being recorded and this gate would read green
 *      forever. So the snapshot reports whether `ddl_guard` is attached and
 *      enabled, and --strict FAILS when it is not. A blind ratchet is a failure,
 *      not a pass.
 *
 * SCOPE. `audit.canonical_findings` only covers REGISTERED tables, so a new
 * table that is never registered produces no findings here at all — that hole is
 * the other half of this pair, ./check-unregistered-entities.ts. Run both.
 *
 * The baseline (`post-doctrine-baseline.json`) is a COUNT OF FAIL FINDINGS,
 * seeded from live on 2026-08-21 (26 findings across 4 `seo` tables). The gate's
 * job is preventing growth, not forcing an instant cleanup.
 *
 *   pnpm check:post-doctrine            # loud, exit 0 (advisory)
 *   pnpm check:post-doctrine --strict   # exit 1 over baseline (release gate)
 *   pnpm check:post-doctrine --update-baseline
 *   pnpm check:post-doctrine --refresh  # audit.refresh() first (4.5-5.5s)
 *   pnpm check:post-doctrine --json
 *
 * Exit codes: 0 pass / advisory / creds absent · 1 over baseline in --strict · 2 unreadable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { C, pullSnapshot, printPreamble } from "./snapshot";
import type { PostDoctrineFail, RatchetSnapshot } from "./snapshot";

const BASELINE_PATH = resolve(import.meta.dirname, "post-doctrine-baseline.json");

const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");
const REFRESH = process.argv.includes("--refresh");
const UPDATE = process.argv.includes("--update-baseline");

interface Baseline {
  _comment: string;
  fail_findings: number;
  seeded_at: string;
}

function byTable(fails: PostDoctrineFail[]): Map<string, PostDoctrineFail[]> {
  const m = new Map<string, PostDoctrineFail[]>();
  for (const f of fails) {
    const k = `${f.schema}.${f.table}`;
    const list = m.get(k);
    if (list) list.push(f);
    else m.set(k, [f]);
  }
  return m;
}

function report(snapshot: RatchetSnapshot, baseline: Baseline): boolean {
  const fails = snapshot.post_doctrine_fails;
  const grouped = byTable(fails);

  console.log("");
  console.log(`${C.bold}  Post-doctrine conformance (ratchet)${C.reset}`);
  console.log(
    `  ${C.dim}live snapshot ${snapshot.generated_at} · cutoff ${snapshot.post_doctrine_cutoff} · ` +
      `${snapshot.births_after_cutoff} table(s) born since${C.reset}`,
  );
  const blocking = printPreamble(snapshot, STRICT);
  console.log("");

  if (grouped.size === 0) {
    console.log(`${C.green}  Every table born since the cutoff is conformant.${C.reset}`);
  }
  for (const [table, rows] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
    const born = (rows[0]?.born_at ?? "").slice(0, 10);
    console.log(
      `  ${C.red}✗${C.reset} ${table.padEnd(34)} ${String(rows.length).padStart(2)} FAIL  ${C.dim}born ${born}${C.reset}`,
    );
    console.log(`      ${C.dim}${[...new Set(rows.map((r) => r.check_name))].join(", ")}${C.reset}`);
  }
  console.log("");
  console.log(
    `  ${C.bold}${fails.length}${C.reset} FAIL finding(s) on post-doctrine tables  ·  baseline ${C.bold}${baseline.fail_findings}${C.reset}`,
  );

  const over = fails.length - baseline.fail_findings;
  if (over > 0) {
    console.log("");
    console.log(
      `${STRICT ? C.red : C.yellow}${C.bold}  CANONICAL RATCHET EXCEEDED — ${over} NEW conformance FAIL(s) on a table born after the doctrine cutoff.${C.reset}`,
    );
    console.log(
      `  ${C.cyan}fix: bring the table to contract — iam.verify_canonical('<schema>','<table>','<token>') names every check;${C.reset}`,
    );
    console.log(
      `  ${C.cyan}      regenerate policies with iam.apply_rls, never hand-edit them. New tables come from${C.reset}`,
    );
    console.log(`  ${C.cyan}      platform.create_entity_table(...), which produces a conformant table by construction.${C.reset}`);
    console.log(
      `  ${C.dim}      Declaring a table 'machinery' to clear red is an ARMAN decision with a written reason${C.reset}`,
    );
    console.log(`  ${C.dim}      on platform.entity_types.audit_class_reason — an agent may not self-declare one.${C.reset}`);
  } else if (over < 0) {
    console.log("");
    console.log(`${C.green}${C.bold}  ${-over} fewer than baseline — shrink the ratchet:${C.reset}`);
    console.log(`  ${C.cyan}pnpm check:post-doctrine --update-baseline${C.reset}`);
  } else {
    console.log("");
    console.log(`${C.green}${C.bold}  At baseline. No table born since the cutoff has regressed.${C.reset}`);
  }
  console.log("");
  return blocking;
}

async function main(): Promise<number> {
  const snapshot = await pullSnapshot({ refresh: REFRESH });
  if (!snapshot) return 0;

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  const count = snapshot.post_doctrine_fails.length;

  if (UPDATE) {
    const next: Baseline = { ...baseline, fail_findings: count, seeded_at: snapshot.generated_at };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`${C.green}baseline updated: ${baseline.fail_findings} → ${count}${C.reset}`);
    return 0;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ baseline: baseline.fail_findings, fail_findings: count, snapshot }, null, 2));
    return STRICT && count > baseline.fail_findings ? 1 : 0;
  }

  const preambleBlocking = report(snapshot, baseline);
  if (!STRICT) return 0;
  return count > baseline.fail_findings || preambleBlocking ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}[ERROR]${C.reset} ${String(err)}`);
    process.exit(2);
  },
);
