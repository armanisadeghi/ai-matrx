// LANE SOURCE-KEY — headless proof on the shared preview: a row-change schedule made through the
// schedule form on a record-store table is saved under `record:<table id>` and fires ONCE on a
// real row change; then it is retired and the table archived.
//
// Seat: admin@admin.com (credentials from .env.local, never printed), admin's Workspace, a
// disposable table this walk declares itself ("Harbor Point service calls"), admin's own
// "Quick Test Agent". Usage: node scripts/source-key-walk.mjs <step>  (step = setup | form | change | retire)
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.SOURCE_KEY_ORIGIN ?? "http://source-key.localhost:3001";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const AGENT = "92c37a37-7630-4517-b2a2-b6f1d2427208"; // admin's Quick Test Agent
const STATE = process.env.SOURCE_KEY_STATE;
const OUT = process.env.SOURCE_KEY_OUT;
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
if (authErr) throw authErr;
console.log(`seat: ${auth.user.email}`);
const custom = sb.schema("custom");
const rpc = async (fn, args) => {
  const { data, error } = await custom.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} ${error.hint ?? ""}`);
  return data;
};

const step = process.argv[2];
if (step === "setup") {
  const tableId = await rpc("table_declare", { p_organization_id: ORG, p_spec: {
    name: "Harbor Point service calls", slug: `harbor_point_service_calls_${Date.now()}`, type: "entity",
    label_singular: "Service call", label_plural: "Service calls", title_field: "call_number", display: "list",
    weight: "light", ordered: true, row_order: "sorted", agent_writable: true, retention_days: 365,
    default_sort: [{ field: "call_number", direction: "asc" }], parent_id: "19b5970f-b3e5-5d34-b505-d8c44450d42f", fields: [{ name: "call_number" }] } });
  const tid = typeof tableId === "string" ? tableId : tableId?.id ?? tableId?.table_id;
  await rpc("field_declare", { p_organization_id: ORG, p_table_id: tid, p_spec: { key: "call_number", label: "Call", type: "text", required: true, sort: 10 } });
  await rpc("field_declare", { p_organization_id: ORG, p_table_id: tid, p_spec: { key: "status", label: "Status", type: "select", sort: 20, options: ["Scheduled", "En route", "On site", "Complete", "Invoiced"] } });
  await rpc("field_declare", { p_organization_id: ORG, p_table_id: tid, p_spec: { key: "customer", label: "Customer", type: "text", sort: 30 } });
  const rec = await rpc("record_write", { p_organization_id: ORG, p_table_id: tid, p_data: { call_number: "CALL-3107", status: "On site", customer: "Morales residence, 4418 N Pearl St, Tacoma" } });
  state.tableId = tid; state.recordId = typeof rec === "string" ? rec : rec?.id ?? rec?.record_id; save();
  console.log(JSON.stringify(state));
} else if (step === "form") {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  console.log(`browser seat: ${who}`);
  let posted = null; let answered = null;
  page.on("request", (r) => { if (/schedul/.test(r.url()) && r.method() !== "GET") console.log("request", r.method(), r.url().slice(0, 160)); if (/\/scheduler\/tasks$/.test(r.url()) && r.method() === "POST") { try { posted = JSON.parse(r.postData() ?? "null"); } catch {} } });
  page.on("response", async (r) => { if (/\/scheduler\/tasks$/.test(r.url()) && r.request().method() === "POST") answered = { status: r.status(), body: (await r.text().catch(() => "")).slice(0, 600) }; });
  const t = state.tableId;
  const prompt = "A service call in Harbor Point's table changed status. Say which call and its new status in one sentence.";
  await page.goto(`${ORIGIN}/schedules/new?trigger=event&tableId=${t}&entityType=${encodeURIComponent(`record:${t}`)}&agentId=${AGENT}&prompt=${encodeURIComponent(prompt)}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.locator("#title").waitFor({ timeout: 240000 });
  await page.waitForTimeout(4000);
  await page.locator("#title").fill("Tell dispatch when a Harbor Point service call changes status");
  await page.locator("label").filter({ hasText: "A row is changed" }).locator("button[role=checkbox]").first().click();
  const statusBox = page.locator("label").filter({ hasText: /^Status$/ }).locator("button[role=checkbox]").first();
  await statusBox.waitFor({ timeout: 90000 });
  await statusBox.click();
  await page.screenshot({ path: `${OUT}/source-key-1-form.png`, fullPage: true });
  await page.getByRole("button", { name: /Create schedule/ }).first().click();
  // No active workspace yet: the app asks which one this schedule is for, as it asks a person.
  const ask = page.getByText("Which workspace is this for?");
  if (await ask.isVisible({ timeout: 8000 }).catch(() => false)) {
    const pick = page.getByText("admin's Workspace", { exact: true }).last();
    await pick.scrollIntoViewIfNeeded();
    await pick.click();
    await page.getByRole("button", { name: /^Continue$/ }).click();
    console.log("workspace chosen in the app's own dialog: admin's Workspace");
  }
  for (let i = 0; i < 20 && !answered; i += 1) await page.waitForTimeout(500);
  if (!answered && /\/schedules\/new/.test(page.url())) {
    // The workspace dialog continues where the person left off; if the form is still here, submit again.
    await page.getByRole("button", { name: /Create schedule/ }).first().click();
    for (let i = 0; i < 40 && !answered; i += 1) await page.waitForTimeout(500);
  }
  const errs = await page.evaluate(() => [...document.querySelectorAll(".text-destructive,[role=alert]")].map((e) => e.textContent?.trim()).filter(Boolean));
  console.log("errors on the page:", JSON.stringify(errs));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/source-key-2-after-create.png`, fullPage: true });
  console.log(JSON.stringify({ posted_trigger: posted?.trigger ?? posted?.triggers ?? null, answered, url: page.url() }, null, 2));
  await browser.close();
} else if (step === "change") {
  await rpc("record_update", { p_organization_id: ORG, p_record_id: state.recordId, p_patch: { customer: "Morales residence, 4418 N Pearl St, Tacoma (gate code on file)" } });
  console.log("customer-only change written (must NOT fire)");
  await new Promise((r) => setTimeout(r, 3000));
  await rpc("record_update", { p_organization_id: ORG, p_record_id: state.recordId, p_patch: { status: "Complete" } });
  console.log("status change written: On site -> Complete (must fire once)");
} else if (step === "retire") {
  await rpc("table_archive", { p_organization_id: ORG, p_table_id: state.tableId });
  console.log("table archived");
}
