// Data-doctrine v5 real-data crew B — enters synthesized personal-life use cases
// through the live record store's own doors (org_create RPC + @ai-matrx/records/core),
// signed in as admin@admin.com. Logs every refusal/mangling it hits.
//
// Usage: node scripts/campaign-tests/use-cases/enter-real-data.mjs <use-case-file.json>
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env.local"), quiet: true });

const usecaseFile = process.argv[2];
if (!usecaseFile) {
  console.error("Usage: node enter-real-data.mjs <use-case-file.json>");
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
if (auth.user?.email !== process.env.AI_ADMIN_USERNAME) {
  throw new Error(`Wrong identity: signed in as ${auth.user?.email}`);
}
console.log(`Signed in as ${auth.user.email} (${auth.user.id})`);

// --- 1. Create the organization through org_create, tagged test_fixture ---
// (or reuse an existing one passed as argv[3], for reruns after a mid-way failure)
let org;
const reuseOrgId = process.argv[3];
if (reuseOrgId) {
  const { data, error } = await client.schema("iam").from("organizations").select("id,slug,name,settings").eq("id", reuseOrgId).single();
  if (error) throw new Error(`Could not reuse org ${reuseOrgId}: ${error.message}`);
  org = data;
  console.log(`Reusing organization: ${org.id} slug=${org.slug}`);
} else {
  const baseSlug = usecase.use_case;
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await client.rpc("org_create", {
      p_name: usecase.organization_name,
      p_slug: slug,
      p_description: usecase.one_sentence,
      p_settings: usecase.settings_tag ?? { test_fixture: true },
    });
    if (!error) { org = data; break; }
    if (error.code === "23505") { slug = `${baseSlug}-${Date.now().toString(36)}`; continue; }
    logLimit(`org_create for "${usecase.organization_name}"`, `${error.code}: ${error.message}`, "organization created");
    throw error;
  }
  console.log(`Organization created: ${org.id} slug=${org.slug} settings=${JSON.stringify(org.settings)}`);
}

// --- 1b. Switch the record store on for this organization (unified-data-ramp) ---
{
  const { data, error } = await client.schema("platform").rpc("unified_data_store_set", {
    p_organization_id: org.id,
    p_on: true,
    p_note: "Enabling record store for real-data crew B seeding script",
  });
  if (error) {
    logLimit("switch the record store on via platform.unified_data_store_set", `${error.code}: ${error.message}`, "the store switched on for this new organization");
    throw new Error(error.message);
  }
  console.log(`Record store switch: ${JSON.stringify(data)}`);
}

// --- 2. Records client over the custom schema doors ---
const CUSTOM = "custom";
async function rpc(fn, args) {
  const { data, error } = await client.schema(CUSTOM).rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn} refused: ${error.code} ${error.message}`), { code: error.code, fn, args });
  return data;
}

let personKernelId;
try {
  personKernelId = await rpc("person_kernel_id", {});
  if (Array.isArray(personKernelId)) personKernelId = personKernelId[0];
} catch (e) {
  logLimit("resolve the person kernel table id", e.message, "a kernel table id back");
  throw e;
}

let homeId;
try {
  homeId = await rpc("record_write", {
    p_organization_id: org.id,
    p_table_id: personKernelId,
    p_data: { name: `${usecase.organization_name} home` },
  });
} catch (e) {
  logLimit("write a home record under the person kernel", e.message, "a record id back");
  throw e;
}
console.log(`Home record: ${JSON.stringify(homeId)}`);
if (Array.isArray(homeId)) homeId = homeId[0];

const tableIds = {}; // table key -> table_id
const fieldIds = {}; // "tableKey.fieldName" -> field_id
const recordIds = {}; // "tableKey::titleValue" -> record_id

const tableEntries = Object.entries(usecase.tables);

// --- 3. Declare each table, then its fields ---
for (const [tableKey, tdef] of tableEntries) {
  const firstField = tdef.fields[0];
  const spec = {
    name: tableKey,
    slug: `${org.slug.replace(/-/g, "_")}_${tableKey}`,
    type: "entity",
    label_singular: tableKey.replace(/s$/, ""),
    label_plural: tableKey,
    display: "list",
    weight: "light",
    ordered: false,
    row_order: "manual",
    title_field: firstField,
    retention_days: 365,
    agent_writable: true,
    default_sort: [{ field: firstField, direction: "asc" }],
    fields: [{ name: firstField }],
    parent_id: homeId,
  };
  let tableId;
  try {
    tableId = await rpc("table_declare", { p_organization_id: org.id, p_spec: spec });
  } catch (e) {
    logLimit(`table_declare for "${tableKey}"`, e.message, "a table id back");
    throw e;
  }
  if (Array.isArray(tableId)) tableId = tableId[0];
  tableIds[tableKey] = tableId;
  console.log(`Table "${tableKey}" declared: ${tableId}`);

  // declare remaining fields (skip firstField, already bootstrapped by table_declare)
  for (const fname of tdef.fields) {
    if (fname === firstField) { fieldIds[`${tableKey}.${fname}`] = "BOOTSTRAP"; continue; }
    const ftype = tdef.field_types?.[fname] ?? "text";
    let fieldSpec = { label: fname };
    if (ftype === "text") fieldSpec.plain = "text";
    else if (ftype === "long_text") fieldSpec.plain = "long_text";
    else if (ftype === "number") fieldSpec.plain = "number";
    else if (ftype === "date") fieldSpec = { ...fieldSpec, type: "datetime", kind: "date" };
    else if (ftype === "currency") fieldSpec = { ...fieldSpec, type: "currency", unit: "USD" };
    else if (ftype === "choice") fieldSpec = { ...fieldSpec, type: "select", options: tdef.choices?.[fname] ?? [] };
    else if (ftype === "boolean") {
      // No boolean/checkbox primitive exists in the 13 parity types + 3 plain
      // behaviours (custom.parity_field_types()) — logged as a limitation.
      fieldSpec = { ...fieldSpec, type: "select", options: ["Yes", "No"] };
      logLimit(
        `declare boolean field "${fname}" on "${tableKey}"`,
        "no boolean/checkbox parity_type exists (only the 13 parity types + text/long_text/number)",
        "a native boolean/checkbox field type, or the door to accept plain:\"boolean\"",
      );
    } else if (ftype.startsWith("relation:")) {
      const targetKey = ftype.split(":")[1];
      const targetTableId = tableIds[targetKey];
      if (!targetTableId) {
        logLimit(`declare relation field "${fname}" on "${tableKey}"`, `target table "${targetKey}" not yet declared (tables not in dependency order)`, "a relation target resolvable regardless of declaration order, or a clear ordering requirement documented up front");
        continue;
      }
      fieldSpec = { ...fieldSpec, type: "relation", relation_target: targetTableId, relation_max: 1, on_target_delete: "restrict" };
    }
    try {
      let fieldId = await rpc("field_declare", { p_organization_id: org.id, p_table_id: tableId, p_spec: fieldSpec });
      if (Array.isArray(fieldId)) fieldId = fieldId[0];
      fieldIds[`${tableKey}.${fname}`] = fieldId;
    } catch (e) {
      logLimit(`field_declare "${fname}" (${ftype}) on "${tableKey}"`, e.message, "a field id back");
    }
  }
}

// --- 4. Write rows ---
for (const [tableKey, tdef] of tableEntries) {
  const tableId = tableIds[tableKey];
  if (!tableId) continue;
  let written = 0;
  for (const row of tdef.rows) {
    const doc = {};
    for (const [fname, val] of Object.entries(row)) {
      const ftype = tdef.field_types?.[fname];
      if (ftype?.startsWith("relation:")) {
        const targetKey = ftype.split(":")[1];
        const targetTitle = val;
        const targetRecId = recordIds[`${targetKey}::${targetTitle}`];
        if (!targetRecId) {
          logLimit(`resolve relation "${fname}" -> "${targetTitle}" on "${tableKey}"`, "target record not found (written after this row, or title mismatch)", "relations resolvable regardless of write order");
          continue;
        }
        doc[fname] = targetRecId;
      } else if (ftype === "boolean") {
        // Declared as select(["Yes","No"]) — see the logLimit above; the
        // choice field wants a matching label, not a JS boolean.
        doc[fname] = val ? "Yes" : "No";
      } else {
        doc[fname] = val;
      }
    }
    try {
      let recId = await rpc("record_write", { p_organization_id: org.id, p_table_id: tableId, p_data: doc });
      if (Array.isArray(recId)) recId = recId[0];
      const titleVal = row[tdef.fields[0]];
      recordIds[`${tableKey}::${titleVal}`] = recId;
      written++;
    } catch (e) {
      logLimit(`record_write row on "${tableKey}" (${JSON.stringify(row).slice(0, 80)}...)`, e.message, "a record id back");
    }
  }
  console.log(`Table "${tableKey}": wrote ${written}/${tdef.rows.length} rows`);
}

// --- 5. Write the run report ---
const report = {
  use_case: usecase.use_case,
  organization: { id: org.id, slug: org.slug, name: org.name, settings: org.settings },
  tables: tableIds,
  rows_written: Object.fromEntries(tableEntries.map(([k, v]) => [k, v.rows.length])),
  limitations,
};
const outPath = path.resolve(__dirname, `${usecase.use_case}.RESULT.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nReport written to ${outPath}`);
console.log(`Organization id: ${org.id}  slug: ${org.slug}`);
console.log(`Limitations hit: ${limitations.length}`);
