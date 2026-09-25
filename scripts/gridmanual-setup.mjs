// scripts/gridmanual-setup.mjs — LANE GRID-MANUAL: admin@admin.com's own disposable table for the
// headless walk (archived after). Harbor Street Café's morning prep list, with a Station choice
// column so the kanban can be drawn, and one saved grid view "Morning run" (sorted, not yet by hand).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createRecordsClient, declareTable, supabaseDataSource } from "@ai-matrx/records/core";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const ORG = process.env.ORG ?? "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
if (error) throw error;
const client = createRecordsClient({ dataSource: supabaseDataSource(sb), organizationId: ORG, actor: { actor: "user", user_id: auth.user.id, on_behalf_of: null } });
const made = await declareTable(client, {
  name: "Harbor Street Café — Morning Prep",
  labelSingular: "Prep task",
  labelPlural: "Prep tasks",
  fields: [
    { key: "task", label: "Task", type: "text", sort: 10 },
    { key: "station", label: "Station", type: "select", sort: 20, options: ["Grill", "Pastry", "Cold line"] },
    { key: "minutes", label: "Minutes", type: "number", sort: 30 },
  ],
});
if (!made.ok) throw new Error(JSON.stringify(made.error));
const table = made.data;
const rows = [
  ["Proof the croissant dough", "Pastry", 40],
  ["Bake the morning buns", "Pastry", 25],
  ["Slice tomatoes and onions", "Cold line", 15],
  ["Whisk the hollandaise", "Grill", 10],
  ["Season the hash browns", "Grill", 12],
  ["Portion the fruit cups", "Cold line", 20],
];
for (const [task, station, minutes] of rows) {
  const w = await client.recordWrite({ table_id: table, data: { task, station, minutes } });
  if (!w.ok) throw new Error(JSON.stringify(w.error));
}
const view = await client.viewDeclare({ table_id: table, spec: { name: "Morning run", definition: { layout: "grid", sorts: [], is_default: false } } });
if (!view.ok) throw new Error(JSON.stringify(view.error));
console.log(JSON.stringify({ table, view: view.data }));
