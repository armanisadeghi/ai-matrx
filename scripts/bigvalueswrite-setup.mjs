// scripts/bigvalueswrite-setup.mjs — lane BIG-VALUES-WRITE: admin@admin.com's own disposable table
// for the headless walk (archived after), in admin's Workspace. Brightline Heating & Air's policy
// register: one row per policy, the policy's whole text in a long-text column.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createRecordsClient, declareTable, supabaseDataSource } from "@ai-matrx/records/core";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const ORG = process.env.ORG ?? "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
if (error) throw error;
const client = createRecordsClient({ dataSource: supabaseDataSource(sb), organizationId: ORG, actor: { actor: "user", user_id: auth.user.id, on_behalf_of: null } });
const made = await declareTable(client, {
  name: "Brightline Heating & Air — Policies",
  labelSingular: "Policy",
  labelPlural: "Policies",
  fields: [
    { key: "policy", label: "Policy", type: "text", sort: 10 },
    { key: "policy_text", label: "Policy text", type: "long_text", sort: 20 },
    { key: "owner", label: "Owner", type: "text", sort: 30 },
  ],
});
if (!made.ok) throw new Error(JSON.stringify(made.error));
const table = made.data;
const rows = [
  ["Records retention and destruction", "Draft — the approved text goes here.", "Office manager"],
  ["Refrigerant handling", "Only EPA 608 certified technicians recover or charge refrigerant; every recovery is logged the same day.", "Service manager"],
];
const ids = [];
for (const [policy, policy_text, owner] of rows) {
  const w = await client.recordWrite({ table_id: table, data: { policy, policy_text, owner } });
  if (!w.ok) throw new Error(JSON.stringify(w.error));
  ids.push(w.data?.record_id ?? w.data?.id ?? w.data);
}
console.log(JSON.stringify({ table, records: ids }));
