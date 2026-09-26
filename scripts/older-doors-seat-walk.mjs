// scripts/older-doors-seat-walk.mjs — lane OLDER-DOORS-AFTER-SWITCH, from a real seat.
//
// Signs in as admin@admin.com through the app's own login form (scripts/lib/seat-browser.mjs,
// headless), takes the session the browser now holds, and calls the OLDER doors directly with the
// app's own client (supabase-js, the publishable key, that person's token) — exactly what an old
// grid, the extension or a workflow step does — against admin's switched test organization
// "Harbor Dental Group" (11f4e747…), whose older table "Hygiene Recall Schedule" moved with the
// switch. Expects: the older read answers the same rows marked moved; every older write door
// refuses with the sentence naming the copy's address; the copy in the new system still takes a
// new patient (archived again at the end — soft, never deleted).
//
//   ORIGIN=http://older-doors.localhost:3001 node scripts/older-doors-seat-walk.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { signIn } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://older-doors.localhost:3001";
const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"; // Harbor Dental Group (admin's test org)
const TABLE = "b00bde4d-1adc-4682-88eb-57453aabf014"; // Hygiene Recall Schedule (moved)
const ROW = "314c6de2-73e0-4064-801d-0b3559bc7656"; // Theo Brannigan
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

function sessionFromCookies(cookies) {
  const parts = cookies
    .filter((c) => /^sb-(matrx-auth-v2|.*-auth-token)(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!parts.length) throw new Error("no Supabase session cookie after sign-in");
  let raw = decodeURIComponent(parts.map((c) => c.value).join(""));
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
  return JSON.parse(raw);
}

const out = { origin: ORIGIN, organization: ORG, table: TABLE, steps: [] };
const step = (name, result) => out.steps.push({ name, ...result });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);
  const session = sessionFromCookies(await context.cookies());
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  const { data: me } = await client.auth.getUser(session.access_token);
  out.token_is = me?.user?.email;

  // 1. the older read: same rows, marked moved
  const full = await client.rpc("get_full_table", { ref: { table_id: TABLE } });
  step("get_full_table", { error: full.error?.message ?? null, row_count: full.data?.row_count, moved_to: full.data?.moved_to ?? null });
  const page1 = await client.rpc("get_user_table_data_paginated_v2", { p_table_id: TABLE, p_limit: 50, p_offset: 0 });
  step("get_user_table_data_paginated_v2", { error: page1.error?.message ?? null, rows: page1.data?.data?.length, moved_to: page1.data?.moved_to ?? null });

  // 2. every older write door refuses, naming the copy
  const writes = [
    ["update_data_row_in_user_table", () => client.rpc("update_data_row_in_user_table", { p_row_id: ROW, p_data: { reminder_sent: true } })],
    ["udt_upsert_cell", () => client.rpc("udt_upsert_cell", { p_table_id: TABLE, p_row_id: ROW, p_field_name: "reminder_sent", p_value: true })],
    ["udt_upsert_row", () => client.rpc("udt_upsert_row", { p_table_id: TABLE, p_row_id: ROW, p_data: { reminder_sent: true } })],
    ["append_rows_to_user_table", () => client.rpc("append_rows_to_user_table", { p_table_id: TABLE, p_rows: [{ patient: "Imani Rosewood", hygienist: "Marisol", recall_due: "2026-12-03" }] })],
    ["add_data_row_to_user_table", () => client.rpc("add_data_row_to_user_table", { p_table_id: TABLE, p_data: { patient: "Imani Rosewood", hygienist: "Marisol", recall_due: "2026-12-03" } })],
    ["udt_bulk_write", () => client.rpc("udt_bulk_write", { p_table_id: TABLE, p_operations: [{ op: "merge", row_id: ROW, data: { reminder_sent: true } }] })],
  ];
  for (const [name, call] of writes) {
    const r = await call();
    step(name, { refused: Boolean(r.error), says: r.error?.message ?? null, code: r.error?.code ?? null, data: r.error ? null : r.data });
  }

  // 3. the older rows did not move
  const after = await client.rpc("get_user_table_data_paginated_v2", { p_table_id: TABLE, p_limit: 50, p_offset: 0 });
  const theo = (after.data?.data ?? []).find((r) => r.id === ROW);
  step("older rows unchanged", { rows: after.data?.data?.length, theo_reminder_sent: theo?.data?.reminder_sent ?? null });

  // 4. the copy in the new system still writes (then archived again, soft)
  const wrote = await client.schema("custom").rpc("record_write", {
    p_organization_id: ORG,
    p_table_id: TABLE,
    p_data: { patient: "Imani Rosewood", hygienist: "Marisol", last_cleaning: "2026-06-03", recall_due: "2026-12-03", reminder_sent: false },
  });
  step("copy record_write", { error: wrote.error?.message ?? null, record_id: wrote.data ?? null });
  if (wrote.data) {
    const undo = await client.schema("custom").rpc("record_delete", { p_organization_id: ORG, p_record_id: wrote.data });
    step("copy record archived again", { error: undo.error?.message ?? null });
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));
