#!/usr/bin/env npx tsx
/**
 * LIST-TABLES-FIX (2026-10-08) - NOTHING LIVE MAY NAME A RELATION THAT NO LONGER EXISTS.
 *
 * THE DEFECT: `platform.api_tables()` (the table list behind the `tables` MCP tool and REST list_tables)
 * asked `has_table_privilege` about every active `platform.entity_types` row. Six active rows still named
 * `context.*` tables that moved to `deprecated.*`, so the whole list died with 42P01 for everyone.
 *
 * WHAT IT ASSERTS (read only, always rolled back)
 *  1. `platform.api_tables()` runs without raising (the exact failing call).
 *  2. Every ACTIVE platform.entity_types row names a relation that exists, except the rows in the baseline.
 *  3. The audit snapshot (audit.broken_functions, severity real, "relation ... does not exist") holds no
 *     function that is not in the baseline. The baseline may only shrink.
 *
 *   pnpm check:no-missing-relation-references          # loud, exit 0
 *   pnpm check:no-missing-relation-references:strict   # exit 1 on a failure
 *   pnpm check:no-missing-relation-references:self-test# clone: installs the pre-fix body, expects 1 to FAIL, then the fix, expects PASS
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { connectCheckDirect } from "./lib/check-target";
import { exitAfterDrain } from "./lib/exit-after-drain";

const HERE = dirname(fileURLToPath(import.meta.url));
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");
const baseline = JSON.parse(readFileSync(resolve(HERE, "missing-relation-references-baseline.json"), "utf8")) as {
  functions: string[];
  registryRows: string[];
};
const FIX = resolve(HERE, "../migrations/campaign/list_tables_skips_registry_rows_whose_table_is_gone.sql");
const PRE_FIX = resolve(HERE, "../migrations/inverse/list_tables_skips_registry_rows_whose_table_is_gone_down.sql");

let failed = 0;
function report(name: string, ok: boolean, detail: string): void {
  if (!ok) failed += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} - ${detail}`);
}

async function main(): Promise<void> {
  const opened = await connectCheckDirect({ gate: "check-no-missing-relation-references", defaultTarget: SELF_TEST ? "clone" : "production" });
  const client = opened.client;
  console.log(`[TARGET] ${opened.target}`);
  try {
    await client.query(SELF_TEST ? "begin" : "begin read only");

    const tableList = async (): Promise<string | null> => {
      await client.query("savepoint t");
      try {
        await client.query("select count(*) from platform.api_tables()");
        await client.query("release savepoint t");
        return null;
      } catch (e) {
        await client.query("rollback to savepoint t");
        return (e as Error).message;
      }
    };

    if (SELF_TEST) {
      const strip = (p: string) => readFileSync(p, "utf8");
      // Plant the defect itself: an active registry row whose table is gone (the clone may still hold the
      // context.* tables that live has lost). Pointed at a missing table inside this transaction only, rolled back below.
      const victim = await client.query<{ s: string; t: string }>(
        `select a.token as s, e.table_name as t from platform.api_tables() a
           join platform.entity_types e on e.token = a.token limit 1`,
      );
      if (!victim.rows[0]) throw new Error("self-test found no listed table to plant the defect on");
      await client.query("update platform.entity_types set table_name = 'selftest_gone_table' where token = $1", [victim.rows[0].s]);
      await client.query(strip(PRE_FIX));
      const before = await tableList();
      report("pre-fix body is caught", before !== null && /does not exist/.test(before), `error: ${before}`);
      await client.query(strip(FIX));
      const after = await tableList();
      report("fixed body passes", after === null, after ?? "table list answered");
      await client.query("rollback");
      console.log(failed === 0 ? "SELF-TEST OK: red on the pre-fix body, green on the fix" : "SELF-TEST FAILED");
      await client.end();
      exitAfterDrain(failed === 0 ? 0 : 1);
    }

    const err = await tableList();
    report("platform.api_tables() runs", err === null, err ?? "answered");

    const rows = await client.query<{ token: string; rel: string }>(
      `select token, schema_name || '.' || table_name as rel from platform.entity_types e
        where is_active and to_regclass(format('%I.%I', schema_name, table_name)) is null order by 1`,
    );
    const newRows = rows.rows.filter((r) => !baseline.registryRows.includes(r.token));
    report("no new active registry row names a missing table", newRows.length === 0,
      newRows.length ? newRows.map((r) => `${r.token} -> ${r.rel}`).join(", ") : `${rows.rows.length} known (baseline)`);

    const fns = await client.query<{ signature: string }>(
      `select distinct signature from audit.broken_functions where severity = 'real' and message ~ 'relation ".*" does not exist'`,
    );
    const newFns = fns.rows.map((r) => r.signature).filter((s) => !baseline.functions.includes(s));
    report("no new function names a missing relation", newFns.length === 0,
      newFns.length ? newFns.join(", ") : `${fns.rows.length} known (baseline)`);
    await client.query("rollback");
  } finally {
    await client.end().catch(() => undefined);
  }
  exitAfterDrain(failed > 0 && STRICT ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  exitAfterDrain(2);
});
