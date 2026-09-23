/**
 * LANE GRID-PRIMITIVES, G5 — AN EXAMPLE TABLE IS A REAL BUSINESS, BUILT WHOLE.
 *
 * THE USE CASE. Every registered use case of `@ai-matrx/records/use-cases` (Harbor Dental's
 * new-patient intake, Ridgeline Physical Therapy's plan of care, the Birchwood Avenue renovation
 * budget, the Alvarado-Chen family's weekly cooking) is built, one at a time, into a fresh
 * organization by `custom.table_from_example` — through the client package's own `exampleSpec`,
 * the exact bytes `tableFromExample` sends — from the seat `authenticated` as admin@admin.com,
 * and every table, column and row must arrive, relations resolved to real record ids.
 *
 * One transaction, ROLLBACK. Nothing survives.
 *
 * RUN IT:  node node_modules/tsx/dist/cli.mjs scripts/campaign-tests/gridprim_g5_examples.ts --target clone|branch
 */
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { exampleSpec } from "../../../aidream/apps/shared/records/src/grid";
import { loadAllUseCases } from "../../../aidream/apps/shared/records/src/use-cases/registry";
import { branchRefOverride, cloneRefOverride, loadBranchDbEnv, loadBranchRef, loadCloneDbEnv, loadCloneRef } from "../lib/migration-target";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";

async function main() {
  const i = process.argv.indexOf("--target");
  const target = i >= 0 ? process.argv[i + 1] : "clone";
  const env = target === "branch"
    ? loadBranchDbEnv(ROOT, loadBranchRef(ROOT, branchRefOverride(process.argv)))
    : loadCloneDbEnv(ROOT, loadCloneRef(ROOT, cloneRefOverride(process.argv)));
  const client = new pg.Client({ ...env, ssl: { rejectUnauthorized: false }, application_name: "gridprim G5 examples" });
  await client.connect();
  let failures = 0;
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '300s'");
    for (const useCase of await loadAllUseCases()) {
      await client.query("savepoint uc");
      const org = (await client.query<{ id: string }>("select gen_random_uuid()::text as id")).rows[0]!.id;
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
      await client.query(
        `insert into iam.organizations (id, name, slug, abbreviation, created_by, settings)
         values ($1, $2, $3, 'UC', $4, jsonb_build_object('test_fixture', $5::text))`,
        [org, useCase.business.name, `${useCase.id}-${org.slice(0, 8)}`, ADMIN, useCase.cleanupTag]);
      await client.query(`insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
                          values ($1, 'organization', $1, $2, 'owner', 'active')`, [org, ADMIN]);
      await client.query(`insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
                          values ('custom', 'system_enabled', 'organization', $1, $1, 'true'::jsonb, 'gridprim G5 examples')`, [org]);
      const home = (await client.query<{ id: string }>(
        `insert into custom.record (organization_id, table_id, data) values ($1, null, jsonb_build_object('name', 'Home')) returning id::text`, [org])).rows[0]!.id;
      await client.query("select set_config('role', 'authenticated', true)");
      try {
        const built = (await client.query<{ b: { tables: Array<{ token: string; table_id: string; records?: number }> } }>(
          "select custom.table_from_example($1, $2, $3::jsonb) as b", [org, home, JSON.stringify(exampleSpec(useCase))])).rows[0]!.b;
        await client.query("select set_config('role', 'postgres', true)");
        const problems: string[] = [];
        for (const t of useCase.tables) {
          const got = built.tables.find((b) => b.token === t.token);
          if (!got) { problems.push(`${t.name}: not built`); continue; }
          const n = (await client.query<{ n: number }>(
            "select count(*)::int as n from custom.record where organization_id = $1 and table_id = $2 and data_class = 'record'", [org, got.table_id])).rows[0]!.n;
          const f = (await client.query<{ n: number }>(
            "select count(*)::int as n from custom.record where organization_id = $1 and table_id = custom.field_kernel_id() and deleted_at is null and data->>'entity_definition_id' = $2", [org, got.table_id])).rows[0]!.n;
          if (n !== t.rows.length) problems.push(`${t.name}: ${n} of ${t.rows.length} rows`);
          if (f < t.fields.length) problems.push(`${t.name}: ${f} of ${t.fields.length} columns`);
        }
        if (problems.length) {
          failures++;
          console.log(`\x1b[31m[FAIL]\x1b[0m ${useCase.business.name}: ${problems.join("; ")}`);
        } else {
          console.log(`\x1b[32m[PASS]\x1b[0m ${useCase.business.name} \x1b[2m— ${useCase.tables.map((t) => `${t.name} ${t.rows.length} rows`).join(", ")}\x1b[0m`);
        }
      } catch (e) {
        failures++;
        console.log(`\x1b[31m[FAIL]\x1b[0m ${useCase.business.name}: ${(e as Error).message}`);
        await client.query("rollback to savepoint uc");
        continue;
      }
      await client.query("release savepoint uc");
    }
    await client.query("rollback");
  } finally {
    await client.end();
  }
  if (failures) { console.log(`\x1b[31m${failures} use case(s) did not build whole\x1b[0m`); process.exit(1); }
  console.log("\x1b[32mG5 EXAMPLES — every registered real use case built whole through custom.table_from_example.\x1b[0m");
}
main().catch((e) => { console.error(`\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m`); process.exit(1); });
