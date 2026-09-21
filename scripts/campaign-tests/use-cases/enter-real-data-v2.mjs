// Data-doctrine v5 real-data crew E2 — generic loader for use-case JSON files
// shaped {organization_name, settings, tables: {tableKey: [rowObject, ...]}}.
// Declares one table per key, infers a field per row-object key from its
// value shape (number -> number, YYYY-MM-DD string -> date, else -> text),
// writes every row through custom.record_write, and logs every refusal.
//
// Usage: node enter-real-data-v2.mjs <use-case.json> [existingOrgId]
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env.local"), quiet: true });

const usecaseFile = process.argv[2];
const reuseOrgId = process.argv[3];
if (!usecaseFile) {
  console.error("Usage: node enter-real-data-v2.mjs <use-case.json> [existingOrgId]");
  process.exit(1);
}
const usecase = JSON.parse(readFileSync(usecaseFile, "utf8"));

const limitations = [];
function logLimit(doing, said, expected) {
  const row = { when: new Date().toISOString(), doing, said, expected };
  limitations.push(row);
  console.error(`LIMITATION: ${doing} -> ${said}`);
}

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: auth, error: authErr } = await client.auth.signInWithPassword({
  email: process.env.AI_ADMIN_USERNAME,
  password: process.env.AI_ADMIN_PASSWORD,
});
if (authErr) throw new Error(`Admin sign-in refused: ${authErr.message}`);
console.log(`Signed in as ${auth.user.email} (${auth.user.id})`);

async function rpc(fn, args) {
  const { data, error } = await client.schema("custom").rpc(fn, args);
  return { data, error };
}

let org;
if (reuseOrgId) {
  const { data, error } = await client.schema("iam").from("organizations").select("id,slug,name,settings").eq("id", reuseOrgId).single();
  if (error) throw new Error(`Could not reuse org ${reuseOrgId}: ${error.message}`);
  org = data;
  console.log(`Reusing organization: ${org.id} slug=${org.slug}`);
} else {
  const baseSlug =
    "fixture-" +
    usecase.organization_name.toLowerCase().replace(/^fixture\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30) +
    "-" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await client.rpc("org_create", {
    p_name: usecase.organization_name,
    p_slug: baseSlug,
    p_description: usecase.use_case,
    p_settings: usecase.settings ?? { test_fixture: true },
  });
  if (error) {
    logLimit(`org_create for "${usecase.organization_name}"`, `${error.code}: ${error.message}`, "organization created");
    throw error;
  }
  org = data;
  console.log(`Organization created: ${org.id} slug=${org.slug} settings=${JSON.stringify(org.settings)}`);

  const { data: knobData, error: knobErr } = await client.schema("platform").rpc("unified_data_store_set", {
    p_organization_id: org.id,
    p_on: true,
    p_note: "data-doctrine crew E2 real-data seeding",
  });
  if (knobErr) {
    logLimit("switch the record store on via platform.unified_data_store_set", `${knobErr.code}: ${knobErr.message}`, "store switched on");
    throw new Error(knobErr.message);
  }
  console.log(`Record store switch: switched_on=${knobData?.switched_on}`);
}

let personKernelId = await rpc("person_kernel_id", {}).then((r) => {
  if (r.error) { logLimit("resolve person kernel id", `${r.error.code}: ${r.error.message}`, "kernel id"); throw r.error; }
  return Array.isArray(r.data) ? r.data[0] : r.data;
});

async function makeHome(name) {
  const { data, error } = await rpc("record_write", { p_organization_id: org.id, p_table_id: personKernelId, p_data: { name } });
  return { data, error };
}

function inferFieldSpec(key, sampleValues) {
  const nonNull = sampleValues.filter((v) => v !== null && v !== undefined);
  const allNum = nonNull.length && nonNull.every((v) => typeof v === "number");
  const allDate = nonNull.length && nonNull.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const isEmail = key.includes("email");
  const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (isEmail) return { key, label, parity_type: "email" };
  let plain = "text";
  if (allNum) plain = "number";
  else if (allDate) plain = "date";
  return { key, label, plain };
}

const tableIds = {};
const rowsWritten = {};

for (const [tableKey, rows] of Object.entries(usecase.tables)) {
  if (!Array.isArray(rows) || rows.length === 0) continue;
  const home = await makeHome(`${tableKey} Home`);
  if (home.error) { logLimit(`home record for ${tableKey}`, `${home.error.code}: ${home.error.message}`, "record id"); continue; }

  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const titleField = keys.find((k) => /name|title/.test(k)) || keys[0];
  const spec = {
    name: tableKey,
    slug: `${org.slug.replace(/-/g, "_")}_${tableKey}`.slice(0, 60),
    type: "entity",
    label_singular: tableKey.replace(/s$/, ""),
    label_plural: tableKey,
    display: "list",
    weight: "light",
    ordered: false,
    row_order: "manual",
    title_field: titleField,
    retention_days: 365,
    agent_writable: true,
    default_sort: [{ field: titleField, direction: "asc" }],
    parent_id: home.data,
    fields: keys.map((k) => ({ name: k })),
  };
  const { data: tableId, error: tErr } = await rpc("table_declare", { p_organization_id: org.id, p_spec: spec });
  if (tErr) { logLimit(`table_declare ${tableKey}`, `${tErr.code}: ${tErr.message}`, "table id"); continue; }
  tableIds[tableKey] = Array.isArray(tableId) ? tableId[0] : tableId;
  console.log(`Table ${tableKey}: ${tableIds[tableKey]}`);

  for (const key of keys) {
    const fspec = inferFieldSpec(key, rows.map((r) => r[key]));
    const { error: fErr } = await rpc("field_declare", {
      p_organization_id: org.id,
      p_table_id: tableIds[tableKey],
      p_spec: fspec,
    });
    if (fErr) logLimit(`field_declare ${tableKey}.${key} (plain=${fspec.plain})`, `${fErr.code}: ${fErr.message}`, "field declared");
  }

  let written = 0;
  for (const row of rows) {
    const { error: wErr } = await rpc("record_write", { p_organization_id: org.id, p_table_id: tableIds[tableKey], p_data: row });
    if (wErr) logLimit(`record_write ${tableKey} row ${JSON.stringify(row).slice(0, 80)}`, `${wErr.code}: ${wErr.message}`, "row written");
    else written += 1;
  }
  rowsWritten[tableKey] = written;
  console.log(`  wrote ${written}/${rows.length} rows`);
}

const result = {
  use_case: usecase.organization_name,
  organization: { id: org.id, slug: org.slug, name: org.name ?? usecase.organization_name, settings: org.settings ?? usecase.settings },
  tables: tableIds,
  rows_written: rowsWritten,
  entry_door: "signed-in supabase-js (admin@admin.com), custom.table_declare / custom.field_declare / custom.record_write",
  limitations,
};
const outFile = usecaseFile.replace(/\.json$/, ".RESULT.json");
writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(`\nWrote result to ${outFile}`);
console.log(JSON.stringify(result, null, 2));
