// LANE S6 — the data the LIVE portal walk opens, written THROUGH THE DOORS as admin@admin.com.
//
// Rincon Plumbing Co — Ventura Branch is an admin@admin.com-owned test organization (flagged
// test_fixture) that test@test.com is NOT a member of, so she walks exactly as a client does.
// Everything is written by the office manager's own signed-in session through the same client
// doors the app calls (table_declare, field_declare, pipeline_declare, record_write,
// record_update, form_declare, portal_declare with its look and forms, portal_invite) — never a
// superuser, never a direct table write. Every business, person, street and number is
// synthesized. Each run makes a new portal and new tables under a fresh suffix.
//
//   node scripts/campaign-tests/_s6_live_walk_fixture.mjs        (prints WALK <key> <value>)
//
// Credentials come from .env.local / ../aidream/.env and are never printed.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
for (const f of [path.join(root, ".env.local"), path.join(root, "../aidream/.env")]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ORG = "20b9d1bb-ca75-42ea-827b-2500f48e82c2"; // Rincon Plumbing Co — Ventura Branch
const HOME = "43706f18-5160-448a-9758-ffedb4d425e0"; // its "Dispatch" Home
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: process.env.AI_ADMIN_USERNAME,
  password: process.env.AI_ADMIN_PASSWORD,
});
if (authErr || auth?.user?.email !== "admin@admin.com") throw new Error(`not signed in as admin@admin.com: ${authErr?.message ?? auth?.user?.email}`);
const c = sb.schema("custom");
async function door(fn, args) {
  const { data, error } = await c.rpc(fn, { p_organization_id: ORG, ...args });
  if (error) throw new Error(`custom.${fn}: ${error.message} ${error.hint ?? ""}`);
  return data;
}
const sfx = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, "");
const table = (name, slug, singular, plural, title) =>
  door("table_declare", {
    p_spec: {
      name, slug: `${slug}_${sfx}`, type: "entity", label_singular: singular, label_plural: plural,
      title_field: title, display: "page", weight: "light", ordered: false, row_order: "sorted",
      default_sort: [], agent_writable: true, retention_days: 365, on_delete: "cascade",
      fields: [{ name: title }], parent_id: HOME,
    },
  });
const field = (t, spec) => door("field_declare", { p_table_id: t, p_spec: spec });
const write = (t, doc) => door("record_write", { p_table_id: t, p_data: doc });
const update = (r, patch) => door("record_update", { p_record_id: r, p_patch: patch, p_expected_version: null });

const managers = await table("Property managers", "property_managers", "Property manager", "Property managers", "building");
await field(managers, { key: "building", label: "Building", plain: "text", sort: 10 });
await field(managers, { key: "manager_email", label: "Manager email", plain: "text", sort: 20 });
const calls = await table("Service calls", "service_calls", "Service call", "Service calls", "problem");
await field(calls, { key: "problem", label: "What is wrong", plain: "text", sort: 10 });
await field(calls, { key: "unit", label: "Unit or area", plain: "text", sort: 20 });
await field(calls, { key: "gate_code", label: "Gate code", plain: "text", sort: 30 });
await field(calls, { key: "internal_notes", label: "Office notes", plain: "text", sort: 90 });
await field(calls, { key: "building", label: "Building", type: "relation", relation_target: managers });
await door("pipeline_declare", {
  p_table_id: calls,
  p_spec: { stage_field: { key: "call_stage", label: "Status", options: ["Requested", "Scheduled", "On site", "Done"] } },
});
const invoices = await table("Invoices", "invoices", "Invoice", "Invoices", "number");
await field(invoices, { key: "number", label: "Invoice", plain: "text", sort: 10 });
await field(invoices, { key: "total", label: "Total", plain: "text", sort: 20 });
await field(invoices, { key: "building", label: "Building", type: "relation", relation_target: managers });
const hours = await table("Crew hours", "crew_hours", "Crew hours entry", "Crew hours", "tech");
await field(hours, { key: "tech", label: "Technician", plain: "text", sort: 10 });
await field(hours, { key: "hours", label: "Hours", plain: "text", sort: 20 });

const seaside = await write(managers, { building: "Seaside Villas HOA", manager_email: "test@test.com" });
const mesa = await write(managers, { building: "Mesa Verde Apartments", manager_email: "mesa.manager@rincon-clients.test" });
const c1 = await write(calls, { problem: "Boiler room floor drain backing up", unit: "Building C basement", gate_code: "4417", internal_notes: "Bill to the HOA reserve account", call_stage: "Requested", building: seaside });
const c2 = await write(calls, { problem: "Leaking shutoff valve at the pool shower", unit: "Pool house", call_stage: "Requested", building: seaside });
await write(calls, { problem: "Slow kitchen drain in unit 12", unit: "Unit 12", call_stage: "Done", building: seaside });
await write(calls, { problem: "Water heater pilot out", unit: "Unit 3B", call_stage: "Scheduled", building: mesa });
await write(calls, { problem: "Sewer smell in the lobby", unit: "Lobby", call_stage: "Requested", building: mesa });
await update(c1, { call_stage: "Scheduled" });
await update(c1, { internal_notes: "Tech: Luis. Parts: 2in check valve" });
await update(c1, { call_stage: "On site" });
await update(c2, { call_stage: "Scheduled" });
await write(invoices, { number: "RPC-2026-0931", total: "$486.00", building: seaside });
await write(invoices, { number: "RPC-2026-0944", total: "$1,240.00", building: mesa });

const form = (t, title, questions) => door("form_declare", { p_table_id: t, p_title: title, p_questions: questions });
const fReq = await form(calls, "Request a service call", [
  { field: "problem", ask: "What is wrong?", required: true },
  { field: "unit", ask: "Which unit or area?", required: true },
  { field: "gate_code", ask: "Gate or lockbox code, if any" },
]);
const fGate = await form(calls, "Update a gate code", [
  { field: "unit", ask: "Which gate?", required: true },
  { field: "gate_code", ask: "The new code", required: true },
]);
const fEmerg = await form(calls, "Report an emergency", [{ field: "problem", ask: "What is happening right now?", required: true }]);
await form(hours, "Log crew hours", [
  { field: "tech", ask: "Technician", required: true },
  { field: "hours", ask: "Hours", required: true },
]);

const portal = await door("portal_declare", {
  p_title: "Your service calls",
  p_client_table_id: managers,
  p_tables: [
    { table_id: calls, names_via: "building", visible_fields: ["problem", "unit", "gate_code", "call_stage"], editable_fields: [], comments: true },
    { table_id: invoices, names_via: "building", visible_fields: ["number", "total"], editable_fields: [] },
  ],
  p_portal_id: null,
  p_slug: `rincon-service-calls-live-${sfx}`,
  p_sign_in_method: "magic_link",
  p_config: {
    style: {
      display_name: "Rincon Plumbing",
      welcome: "Your buildings' service calls, gate codes and invoices, in one place.",
      accent: "blue",
      footer_links: [
        { label: "Call dispatch", url: "tel:+1 805 555 0142" },
        { label: "Email the office", url: "mailto:office@rincon-plumbing.test" },
      ],
    },
    forms: [
      { form_id: fReq, order: 1 },
      { form_id: fGate, order: 2 },
      { form_id: fEmerg, order: 3 },
    ],
  },
});
const invite = await door("portal_invite", {
  p_portal_id: portal, p_client_record_id: seaside, p_email: "test@test.com", p_user_id: null,
});
const card = await door("portal_card", { p_portal_id: portal });
for (const [k, v] of Object.entries({
  org: ORG, portal, slug: card.slug, calls, managers, boiler_call: c1, gate_form: fGate,
  accept_path: invite.accept_path ?? `/invitations/portal/accept/${invite.token}`,
})) console.log(`WALK ${k} ${v}`);
