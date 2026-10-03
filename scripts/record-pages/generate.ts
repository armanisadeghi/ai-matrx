// scripts/record-pages/generate.ts — writes lib/record-pages/record-pages.generated.json, the page→token
// map every record view declares in its own file (lane 7 W5; rules in ./census.ts).
//
//   pnpm tsx scripts/record-pages/generate.ts                    regenerate the map (offline)
//   pnpm tsx scripts/record-pages/generate.ts --refresh-registry first re-read platform.entity_types
//                                                                from production (read-only, reader role)
//   pnpm tsx scripts/record-pages/generate.ts --shrink           drop now-declared entries from the ledger
//   pnpm tsx scripts/record-pages/generate.ts --seed-ledger      write today's pending units into the
//                                                                ledger (FIRST COUNT ONLY — the ledger
//                                                                may only shrink after that)
//
// G1 (features/unified-data/every-record-view-has-custom-fields.test.ts) reruns the census and fails
// when this file is stale, when the ledger grows, or when a declaration is false.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCensus, toGenerated, type EntityTypeRow, type Ledger } from "./census";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GENERATED = "lib/record-pages/record-pages.generated.json";
export const SNAPSHOT = "lib/record-pages/entity-types.snapshot.json";
export const LEDGER = "lib/record-pages/pending.json";

const REGISTRY_SQL = `
select coalesce(json_agg(json_build_object(
  'token', e.token, 'type', lower(e.type), 'custom_fields_enabled', e.custom_fields_enabled,
  'is_active', e.is_active,
  'has_organization', exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                                join pg_namespace n on n.oid = c.relnamespace
                               where n.nspname = e.schema_name and c.relname = e.table_name
                                 and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped))
  order by e.token), '[]')
from platform.entity_types e;`;

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--refresh-registry")) {
    const { psqlRead } = await import("../lib/pooled-db.mjs");
    const r = psqlRead("production", REGISTRY_SQL);
    if (!r.ok) throw new Error(`registry read failed: ${r.stderr}`);
    const rows = JSON.parse(r.stdout.trim().split("\n").pop() ?? "[]") as EntityTypeRow[];
    mkdirSync(join(ROOT, "lib/record-pages"), { recursive: true });
    writeFileSync(join(ROOT, SNAPSHOT), JSON.stringify(rows, null, 1) + "\n");
    console.log(`registry snapshot: ${rows.length} tokens`);
  }
  const entityTypes = JSON.parse(readFileSync(join(ROOT, SNAPSHOT), "utf8")) as EntityTypeRow[];
  let ledger = JSON.parse(readFileSync(join(ROOT, LEDGER), "utf8")) as Ledger;
  let census = buildCensus({ root: ROOT, entityTypes, ledger });
  if (args.has("--seed-ledger")) {
    ledger = {
      exemptCeiling: census.units.filter((u) => u.declaration.kind === "pending").length,
      pending: census.units.filter((u) => u.declaration.kind === "pending").map((u) => u.key),
      tablesPending: census.tables.filter((t) => t.rowToken === "pending").map((t) => t.file),
      listQueue: census.tables.filter((t) => t.rowToken === "noncanonical").map((t) => t.file),
    };
    writeFileSync(join(ROOT, LEDGER), JSON.stringify(ledger, null, 1) + "\n");
    census = buildCensus({ root: ROOT, entityTypes, ledger });
  }
  if (args.has("--seed-list-sources") && !ledger.listSourcesWithoutCustomFields) {
    // FIRST COUNT of the list-source queue only.
    const probe = buildCensus({ root: ROOT, entityTypes, ledger: { ...ledger, listSourcesWithoutCustomFields: [] } });
    ledger = {
      ...ledger,
      listSourcesWithoutCustomFields: probe.problems
        .filter((p) => p.includes("whose source returns no custom_fields"))
        .map((p) => p.split(":")[0]),
    };
    writeFileSync(join(ROOT, LEDGER), JSON.stringify(ledger, null, 1) + "\n");
    census = buildCensus({ root: ROOT, entityTypes, ledger });
  }
  if (args.has("--seed-list-queue") && !ledger.listQueue) {
    // FIRST COUNT of the I2 queue only.
    ledger = { ...ledger, listQueue: census.tables.filter((t) => t.rowToken === "noncanonical").map((t) => t.file) };
    writeFileSync(join(ROOT, LEDGER), JSON.stringify(ledger, null, 1) + "\n");
    census = buildCensus({ root: ROOT, entityTypes, ledger });
  }
  if (args.has("--shrink")) {
    // The one direction the ledger may move without review: entries now declared leave it.
    const pendingNow = new Set(census.units.filter((u) => u.declaration.kind === "pending").map((u) => u.key));
    const tablesNow = new Set(census.tables.filter((t) => t.rowToken === "pending").map((t) => t.file));
    ledger = {
      exemptCeiling: Math.min(
        ledger.exemptCeiling,
        census.units.filter((u) => u.declaration.kind === "pending").length,
      ),
      pending: ledger.pending.filter((k) => pendingNow.has(k)),
      tablesPending: ledger.tablesPending.filter((f) => tablesNow.has(f)),
      listQueue: (ledger.listQueue ?? []).filter((f) =>
        census.tables.some((t) => t.file === f && t.rowToken === "noncanonical"),
      ),
      listSourcesWithoutCustomFields: (ledger.listSourcesWithoutCustomFields ?? []).filter(
        (f) => !census.problems.some((p) => p.startsWith(`${f}: its source returns custom_fields now`)),
      ),
    };
    writeFileSync(join(ROOT, LEDGER), JSON.stringify(ledger, null, 1) + "\n");
    census = buildCensus({ root: ROOT, entityTypes, ledger });
  }
  writeFileSync(join(ROOT, GENERATED), JSON.stringify(toGenerated(census), null, 1) + "\n");
  console.log(JSON.stringify(census.counts));
  if (census.problems.length) {
    console.error(census.problems.map((p) => `  - ${p}`).join("\n"));
    process.exitCode = 1;
  }
}

void main();
