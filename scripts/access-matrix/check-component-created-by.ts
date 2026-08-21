#!/usr/bin/env tsx
/**
 * THE COMPONENT OWNERSHIP LAW conformance gate — `pnpm check:component-created-by`
 *
 * ONE assertion: ZERO RLS policies on an ACTIVE `rls_variant='component'` table
 * may reference `created_by` in `qual` or `with_check`.
 *
 * WHY THIS IS BLOCKING (not advisory like most drift gates). The live count is
 * 0 today and must STAY 0. This is not a slow-moving drift number — a single
 * regenerated component policy that leads with `created_by = auth.uid()` re-opens
 * D182(3): the component `std_insert` parent-editor arm never constrains
 * `created_by`, so a user with editor rights on the PARENT can stamp ANOTHER
 * user as creator and thereby hand that user owner-read on the row. 56 active
 * component tables carried that exact shape before the v3 fix
 * (`iam_apply_rls_v3_component_no_created_by_and_variant_grants.sql`).
 *
 * THE LAW (db-rules FEATURE.md §6d-1, owner ruling 2026-08-14): a component has
 * NO owner column, NO own visibility, and its access IS its parent's.
 * `iam.apply_rls(…,'component')` never emits a `created_by` clause. Ever.
 *
 * DO NOT "fix" a failure here by adding an allowlist. There is no legitimate
 * exception. Either the policy is wrong (regenerate it: `select iam.apply_rls(
 * '<schema>','<table>','<token>','component')`) or the VARIANT is wrong — a
 * sub-row that genuinely needs its own owner with independent access is an
 * ENTITY in a containment relationship, not a component. Fix the variant.
 *
 * Provenance is not lost either way: `history.row_versions` already records who
 * did what to every row, so a component needs no `created_by` to answer "who
 * made this".
 *
 * SQL side: public.component_created_by_report()
 * (migrations/component_created_by_conformance_report.sql).
 *
 * Usage: pnpm check:component-created-by [--strict]
 */

import process from "node:process";
import { C, loadEnv, rpc } from "./lib";

const STRICT = process.argv.includes("--strict");

interface Offender {
  schema_name: string;
  table_name: string;
  policy_name: string;
  cmd: string;
  in_qual: boolean;
  in_with_check: boolean;
}

interface Report {
  component_tables: number;
  policies_scanned: number;
  offender_count: number;
  offenders: Offender[];
}

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) {
    console.log(`${C.yellow}[WARN]${C.reset} component-created-by: Supabase creds absent — skipped.`);
    return 0;
  }

  const r = await rpc<Report>(env, "component_created_by_report", {});

  console.log(`${C.bold}THE COMPONENT OWNERSHIP LAW (db-rules §6d-1)${C.reset}`);
  console.log(
    `${C.dim}  ${r.component_tables} active component table(s), ${r.policies_scanned} policy(ies) scanned${C.reset}`,
  );

  if (r.offender_count === 0) {
    console.log(
      `  ${C.green}OK${C.reset} zero component policies reference created_by\n`,
    );
    console.log(`${C.green}${C.bold}COMPONENT OWNERSHIP LAW HELD${C.reset}`);
    return 0;
  }

  console.log(
    `\n  ${C.red}${C.bold}VIOLATION${C.reset} ${r.offender_count} component polic(ies) reference ${C.bold}created_by${C.reset}:`,
  );
  for (const o of r.offenders) {
    const where = [o.in_qual ? "qual" : null, o.in_with_check ? "with_check" : null]
      .filter(Boolean)
      .join(" + ");
    console.log(
      `        ${C.yellow}${o.schema_name}.${o.table_name}${C.reset} ${o.policy_name} (${o.cmd}) — in ${where}`,
    );
  }
  console.log(
    `\n${C.dim}A component's access IS its parent's. A created_by clause on a component policy${C.reset}`,
  );
  console.log(
    `${C.dim}re-opens D182(3): a parent-editor can stamp another user as creator and hand${C.reset}`,
  );
  console.log(`${C.dim}them owner-read. There is NO legitimate exception — do not allowlist it.${C.reset}`);
  console.log(
    `${C.dim}Repair: select iam.apply_rls('<schema>','<table>','<token>','component');${C.reset}`,
  );
  console.log(
    `${C.dim}   OR — if the row truly needs its own owner, the VARIANT is wrong: it is an${C.reset}`,
  );
  console.log(`${C.dim}   entity in a containment relationship. Fix the variant, not the policy.${C.reset}`);
  return 1;
}

main()
  .then((code) => process.exit(STRICT ? code : 0))
  .catch((err) => {
    console.error(`${C.red}[FAIL]${C.reset} component-created-by crashed: ${String(err)}`);
    process.exit(STRICT ? 1 : 0);
  });
