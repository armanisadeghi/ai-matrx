// One-off completion: write shopping_list_items rows that failed because
// `checked` (boolean in the source JSON) was declared as a select("Yes"/"No")
// field (LIMITATION: no boolean parity_type exists) and the row still carried
// a JS boolean, which custom.record_write correctly refused (23514).
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env.local"), quiet: true });

const usecase = JSON.parse(readFileSync(path.resolve(__dirname, "family-recipe-collection.json"), "utf8"));
const result = JSON.parse(readFileSync(path.resolve(__dirname, "family-recipe-collection.RESULT.json"), "utf8"));
const orgId = result.organization.id;
const shoppingListsTableId = result.tables.shopping_lists;
const shoppingListItemsTableId = result.tables.shopping_list_items;

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: auth, error: authErr } = await client.auth.signInWithPassword({
  email: process.env.AI_ADMIN_USERNAME,
  password: process.env.AI_ADMIN_PASSWORD,
});
if (authErr) throw authErr;
console.log(`Signed in as ${auth.user.email}`);

async function rpc(fn, args, schema = "custom") {
  const { data, error } = await client.schema(schema).rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn} refused: ${error.code} ${error.message}`), { code: error.code });
  return Array.isArray(data) ? data[0] : data;
}
async function rpcMany(fn, args, schema = "custom") {
  const { data, error } = await client.schema(schema).rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn} refused: ${error.code} ${error.message}`), { code: error.code });
  return Array.isArray(data) ? data : [data];
}

// Re-read shopping_lists to map list_name -> record id (light table: read_records)
const listsArr = await rpcMany("read_records", { p_organization_id: orgId, p_table_id: shoppingListsTableId, p_limit: 100, p_offset: 0 }, "custom");
const listNameToId = {};
for (const r of listsArr) {
  const doc = typeof r.document === "string" ? JSON.parse(r.document) : r.document;
  listNameToId[doc.list_name] = r.id;
}
console.log(`Resolved ${Object.keys(listNameToId).length} shopping_lists records`);

let written = 0;
const stillFailing = [];
for (const row of usecase.tables.shopping_list_items.rows) {
  const doc = {
    shopping_list: listNameToId[row.shopping_list],
    ingredient_name: row.ingredient_name,
    quantity: row.quantity,
    unit: row.unit,
    aisle: row.aisle,
    checked: row.checked ? "Yes" : "No",
  };
  if (!doc.shopping_list) { stillFailing.push({ row, reason: "no matching shopping_list id" }); continue; }
  try {
    const recId = await rpc("record_write", { p_organization_id: orgId, p_table_id: shoppingListItemsTableId, p_data: doc });
    written++;
  } catch (e) {
    stillFailing.push({ row, reason: e.message });
  }
}
console.log(`Wrote ${written}/${usecase.tables.shopping_list_items.rows.length} shopping_list_items rows`);
if (stillFailing.length) console.log("Still failing:", JSON.stringify(stillFailing, null, 2));
