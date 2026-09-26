// scripts/switch-aftermath-seed.mjs — lane SWITCH-AFTERMATH fixture: two older data tables in
// admin@admin.com's own test organization "Harbor Dental Group" (11f4e747…), made through the
// older doors as admin (never the service role), so the settings card's Copy again copies them and
// the Data tables switch can be pressed there. Idempotent: a table with the same name is reused.
//
//   node scripts/switch-aftermath-seed.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"; // Harbor Dental Group (admin owns it)
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error: authError } = await client.auth.signInWithPassword({
  email: env.AI_ADMIN_USERNAME,
  password: env.AI_ADMIN_PASSWORD,
});
if (authError) throw new Error(`sign in: ${authError.message}`);
if (auth.user.email !== "admin@admin.com") throw new Error(`signed in as ${auth.user.email}`);

const TABLES = [
  {
    name: "Hygiene Recall Schedule",
    description: "Patients due for their six-month cleaning, by hygienist.",
    fields: [
      ["patient", "Patient", "string"],
      ["hygienist", "Hygienist", "string"],
      ["last_cleaning", "Last cleaning", "date"],
      ["recall_due", "Recall due", "date"],
      ["reminder_sent", "Reminder sent", "boolean"],
    ],
    rows: [
      { patient: "Dana Whitfield", hygienist: "Marisol", last_cleaning: "2026-03-12", recall_due: "2026-09-12", reminder_sent: true },
      { patient: "Theo Brannigan", hygienist: "Marisol", last_cleaning: "2026-04-02", recall_due: "2026-10-02", reminder_sent: false },
      { patient: "Priya Castellanos", hygienist: "Jonah", last_cleaning: "2026-04-18", recall_due: "2026-10-18", reminder_sent: false },
      { patient: "Walt Okafor", hygienist: "Jonah", last_cleaning: "2026-05-07", recall_due: "2026-11-07", reminder_sent: false },
    ],
  },
  {
    name: "Operatory Supply Orders",
    description: "Weekly restock requests for the four operatories.",
    fields: [
      ["item", "Item", "string"],
      ["operatory", "Operatory", "string"],
      ["quantity", "Quantity", "number"],
      ["ordered_on", "Ordered on", "date"],
    ],
    rows: [
      { item: "Prophy paste, mint (200 cups)", operatory: "Op 1", quantity: 2, ordered_on: "2026-09-21" },
      { item: "Nitrile gloves, medium", operatory: "Op 2", quantity: 10, ordered_on: "2026-09-21" },
      { item: "Saliva ejectors", operatory: "Op 3", quantity: 4, ordered_on: "2026-09-22" },
    ],
  },
];

const { data: listed, error: listError } = await client.rpc("get_user_tables");
if (listError) throw new Error(`get_user_tables: ${listError.message}`);
const mine = (listed?.tables ?? []).filter((t) => t.organization_id === ORG);
const out = [];
for (const spec of TABLES) {
  let table = mine.find((t) => t.table_name === spec.name);
  if (table && Number(table.row_count) === 0) {
    for (const row of spec.rows) {
      const { error: rowError } = await client.rpc("add_data_row_to_user_table", { p_table_id: table.id, p_data: row });
      if (rowError) throw new Error(`row into ${spec.name}: ${rowError.message}`);
    }
  }
  if (!table) {
    const { data, error } = await client.rpc("create_user_table_with_fields", {
      p_table_name: spec.name,
      p_description: spec.description,
      p_is_public: false,
      p_organization_id: ORG,
      p_project_id: null,
      p_task_id: null,
      p_fields: spec.fields.map(([field_name, display_name, data_type], i) => ({
        field_name, display_name, data_type, field_order: i, is_required: false,
      })),
    });
    if (error) throw new Error(`create ${spec.name}: ${error.message}`);
    const id = typeof data === "string" ? data : data?.table_id ?? data?.id ?? data?.table?.id;
    if (!id) throw new Error(`create ${spec.name}: no id in ${JSON.stringify(data).slice(0, 300)}`);
    for (const row of spec.rows) {
      const { error: rowError } = await client.rpc("add_data_row_to_user_table", { p_table_id: id, p_data: row });
      if (rowError) throw new Error(`row into ${spec.name}: ${rowError.message}`);
    }
    table = { id, table_name: spec.name, fresh: true };
  }
  out.push({ id: table.id, name: spec.name, fresh: Boolean(table.fresh) });
}
console.log(JSON.stringify(out, null, 2));
