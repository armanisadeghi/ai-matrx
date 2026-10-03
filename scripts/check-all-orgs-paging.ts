/**
 * NO DOOR ASKS AN ORGANIZATION FOR `limit + offset` ROWS AT ONCE (lane ALL-ORGS-PAGING, 2026-10-01).
 *
 * The class: with no organization named (the "All organizations" filter), a door looped the
 * caller's organizations and asked each for `limit + offset` rows in one call. Past the
 * per-organization ceiling the page was refused (22023 PAGE-1 — production 400 at offset 1000 in
 * custom.archived_tables_everywhere, DATA-HOME-3B2), and every page re-paid every organization
 * (57014 under the signed-in 8 s clock — production 500). custom.work_list and custom.work_inbox
 * had the same shape (refused at offset 500 / 200). Fixed by reading each organization in pages
 * within its own custom.page_ceiling until it gives `limit + offset` rows or a short page; the
 * campaign suites prove each door from both seats
 * (scripts/campaign-tests/allorgspaging_every_all_organizations_page_answers.sql,
 * scripts/campaign-tests/datahome3b2_the_archive_everywhere_answers_every_page.sql).
 *
 * This guard scans EVERY function body in the database (pg_get_functiondef, all non-system
 * schemas) with scripts/lib/all-orgs-paging.ts and fails on any body that reaches the caller's
 * organizations and passes `<limit> + <offset>` as a call argument.
 *
 *   pnpm check:all-orgs-paging                       # live (default); the self-test plants on the clone
 *   pnpm check:all-orgs-paging:self-test             # proves it goes RED on the real old bodies
 *
 * UNMEASURED IS NOT PASSED: no database is a failure.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openCheckDb } from "./lib/check-target";
import { findAllOrgsPaging } from "./lib/all-orgs-paging";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");

/** Real bodies, before and after, as the self-test's fixtures. */
const FIXTURES: ReadonlyArray<{ file: string; mustFlag: string[] }> = [
  {
    file: "migrations/inverse/allorgspaging_a_work_list_and_work_inbox_read_each_organization_within_its_page_down.sql",
    mustFlag: ["custom.work_list", "custom.work_inbox"],
  },
  {
    file: "migrations/inverse/datahome3b2_a_the_archive_everywhere_reads_each_organization_once_and_refuses_no_page_down.sql",
    mustFlag: ["custom.read_records_archived"],
  },
  { file: "migrations/campaign/allorgspaging_a_work_list_and_work_inbox_read_each_organization_within_its_page.sql", mustFlag: [] },
  { file: "migrations/campaign/datahome3b2_a_the_archive_everywhere_reads_each_organization_once_and_refuses_no_page.sql", mustFlag: [] },
];

const CENSUS = `
  select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prokind = 'f'
     and p.prolang in (select oid from pg_language where lanname in ('plpgsql', 'sql'))
     and (n.nspname = pg_my_temp_schema()::regnamespace::text
          or (n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_%'))`;

/** The old body's shape, planted in this session's temp schema by the self-test, then rolled back. */
const PLANT = `
  create function pg_temp.allorgspaging_planted(p_limit integer, p_offset integer) returns integer
  language plpgsql as $f$
  declare v_org uuid; v_n integer := 0;
  begin
    for v_org in select o.id from iam.organizations o where o.id in (select iam.my_orgs()) loop
      v_n := v_n + (select count(*) from custom.read_records_archived(v_org, null, 'org', false, p_limit + p_offset, 0));
    end loop;
    return v_n;
  end $f$`;

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");

  if (selfTest) {
    for (const fx of FIXTURES) {
      const bodies = readFileSync(resolve(ROOT, fx.file), "utf8").split(/(?=CREATE OR REPLACE FUNCTION)/i).slice(1);
      const hits = bodies.flatMap((b) => findAllOrgsPaging(b));
      for (const name of fx.mustFlag) {
        if (!hits.some((h) => h.startsWith(`${name}(`))) {
          fail(`self-test - ${fx.file}: the old body asks ${name} for limit + offset, and the detector did not see it.`);
        }
      }
      if (fx.mustFlag.length === 0 && hits.length > 0) {
        fail(`self-test - ${fx.file}: the fixed body was flagged: ${hits.join("; ")}`);
      }
      console.log(
        fx.mustFlag.length
          ? `[ OK ] self-test - RED on the old body in ${fx.file.split("/").pop()}: ${hits.join("; ")}`
          : `[ OK ] self-test - GREEN on the fixed body in ${fx.file.split("/").pop()}`,
      );
    }
  }

  const checkDb = await openCheckDb({ gate: "check:all-orgs-paging", defaultTarget: process.argv.includes("--self-test") ? "clone" : "production" }).catch((error: unknown) => {
    fail(`DATABASE PULL FAILED - this check is UNMEASURED, which is a failure, not a pass.\n${String(error)}`);
  });
  const client = checkDb.client;
  try {
    await client.query("begin read only");
    await client.query("set local statement_timeout = '25s'");
    if (selfTest) {
      await client.query("rollback");
      await client.query("begin");
      await client.query("set local statement_timeout = '25s'");
      await client.query(PLANT);
    }
    const { rows } = await client.query<{ sig: string; def: string }>(CENSUS);
    await client.query("rollback");
    const found = rows
      .map((r) => ({ sig: r.sig, hits: findAllOrgsPaging(r.def) }))
      .filter((r) => r.hits.length > 0);
    if (selfTest) {
      const planted = found.filter((f) => f.sig.includes("allorgspaging_planted"));
      if (planted.length !== 1) fail("self-test - a body planted with the old shape was not named by the catalog census.");
      console.log(`[ OK ] self-test - the catalog census names the planted body: ${planted[0]!.hits.join("; ")} (rolled back)`);
    }
    const real = found.filter((f) => !f.sig.includes("allorgspaging_planted"));
    if (real.length > 0) {
      fail(
        `${real.length} function(s) ask each organization for limit + offset rows in one call — read each ` +
          "organization in pages within custom.page_ceiling(org) instead (see custom.work_list):\n" +
          real.map((f) => `  ${f.sig}: ${f.hits.join("; ")}`).join("\n"),
      );
    }
    console.log(`[ OK ] ${rows.length} function bodies scanned on ${checkDb.target}; none asks an organization for limit + offset at once.`);
  } finally {
    await client.end().catch(() => undefined);
  }
  exitAfterDrain(0);
}

main().catch((error: unknown) => fail(String(error)));
