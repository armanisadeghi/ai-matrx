/**
 * LANE TRASH-TABLES — headless walk on the LIVE site (www.aimatrx.com), as admin@admin.com.
 *
 * Use case: a dental group's office manager keeps a "Sterilization cycle log" table, archives it
 * from the table's own page, and then looks for it in Trash (VERIFIER-25 item 11: it was in neither
 * Trash). The walk:
 *   1. declares the disposable table in Harbor Dental Group (an organization admin@admin.com owns)
 *      with two realistic cycles, through the store's own doors as admin;
 *   2. opens /data-v2/<table>, Settings -> This table -> Archive this table (the page's own control);
 *   3. /trash lists it under Table; Restore from the page; the table page opens again;
 *   4. archives it again from its page; Organization settings -> Trash lists it; Restore there;
 *   5. ends by archiving it again (archive, never delete).
 * Credentials come from .env.local and are never printed. Screenshots:
 *   common-docs/operations/for-arman/2026-09-25/trash-tables/
 *
 *   node scripts/trashtables-walk.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { signIn, until } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "https://www.aimatrx.com";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-25/trash-tables";
const ORG_SLUG = "harbor-dental-group";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
if (authErr) throw authErr;
check("API seat is admin@admin.com", auth.user.email === "admin@admin.com", auth.user.email);
const custom = sb.schema("custom");
const rpc = async (fn, args) => {
  const { data, error } = await custom.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} ${error.hint ?? ""}`);
  return data;
};
const { data: orgs } = await sb.schema("iam").from("organizations").select("id, name").eq("slug", ORG_SLUG);
const org = orgs?.[0];
check("Harbor Dental Group resolved", !!org?.id, org?.id);
const ORG = org.id;

// 1. The disposable table, with realistic content.
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const NAME = `Sterilization cycle log ${stamp}`;
// Harbor Dental Group's Home record (custom.organization_home_id, which is server-only; read once).
const HOME = process.env.WALK_ORG_HOME ?? "5588aafe-0fdd-4fa4-8ba4-8cbb2332cf74";
const tid = await rpc("table_declare", { p_organization_id: ORG, p_spec: {
  name: NAME, slug: `sterilization_cycle_log_${Date.now()}`, type: "entity",
  label_singular: "Cycle", label_plural: "Cycles", title_field: "cycle_number", display: "list",
  weight: "light", ordered: true, row_order: "sorted", agent_writable: true, retention_days: 365,
  default_sort: [{ field: "cycle_number", direction: "asc" }], parent_id: HOME,
  fields: [{ name: "cycle_number" }] } });
const tableId = typeof tid === "string" ? tid : tid?.id ?? tid?.table_id;
await rpc("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "cycle_number", label: "Cycle", type: "text", required: true, sort: 10 } });
await rpc("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "sterilizer", label: "Sterilizer", type: "text", sort: 20 } });
await rpc("field_declare", { p_organization_id: ORG, p_table_id: tableId, p_spec: { key: "result", label: "Spore test", type: "select", sort: 30, options: ["Pass", "Fail", "Pending"] } });
await rpc("record_write", { p_organization_id: ORG, p_table_id: tableId, p_data: { cycle_number: "SC-0412", sterilizer: "Midmark M11, operatory 2", result: "Pass" } });
await rpc("record_write", { p_organization_id: ORG, p_table_id: tableId, p_data: { cycle_number: "SC-0413", sterilizer: "Midmark M11, operatory 2", result: "Pending" } });
check("disposable table declared with two cycles", !!tableId, `${NAME} ${tableId}`);
writeFileSync(`${OUT}/walk-state.json`, JSON.stringify({ tableId, org: ORG, name: NAME }, null, 2));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
check("browser seat is admin@admin.com (the app says so)", who === "admin@admin.com", who);

async function archiveFromPage(label) {
  await page.goto(`${ORIGIN}/data-v2/${tableId}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByText("SC-0412").first().waitFor({ timeout: 90000 });
  await shot(page, `${label}-1-table-page`);
  // The table page's own path: Table menu -> Settings (the panel whose "This table" section archives).
  await page.getByRole("button", { name: "Table menu" }).first().click({ timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, `${label}-1b-table-menu`);
  await page.locator('[role="menu"], [data-radix-popper-content-wrapper]').getByText("Settings", { exact: true }).first()
    .click({ timeout: 30000 });
  const ask = page.getByRole("button", { name: "Archive this table" }).first();
  await ask.scrollIntoViewIfNeeded({ timeout: 30000 });
  await ask.click({ timeout: 30000 });
  await shot(page, `${label}-2-archive-confirm`);
  await page.getByRole("button", { name: "Archive this table" }).first().click({ timeout: 30000 });
  const { v } = await until("table archived", async () => {
    const { data } = await sb.rpc("trash_list", { p_kinds: ["table"], p_limit: 50, p_offset: 0 });
    return (data ?? []).some((r) => r.id === tableId);
  }, 90000);
  await shot(page, `${label}-3-after-archive`);
  return !!v;
}

// 2. Archive from the table's own page.
check("archived from the table page (Settings -> This table -> Archive this table)", await archiveFromPage("a"));

// 3. Personal Trash lists it; Restore from the page.
await page.goto(`${ORIGIN}/trash`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.getByRole("button", { name: /^Table/ }).first().click({ timeout: 90000 });
const row = page.locator("li").filter({ hasText: NAME }).first();
const listed = await row.waitFor({ timeout: 60000 }).then(() => true, () => false);
await shot(page, "b-1-personal-trash-lists-table");
check("personal Trash lists the archived table under Table", listed, NAME);
if (listed) {
  check("its row says Table", /Table/.test(await row.innerText()), (await row.innerText()).replace(/\s+/g, " ").slice(0, 160));
  await row.getByRole("button", { name: /Restore/ }).click({ timeout: 15000 });
  const gone = await until("row leaves Trash", async () => (await page.locator("li").filter({ hasText: NAME }).count()) === 0, 30000);
  await shot(page, "b-2-personal-trash-after-restore");
  check("Restore on /trash removes it from Trash", !!gone.v);
}
await page.goto(`${ORIGIN}/data-v2/${tableId}`, { waitUntil: "domcontentloaded", timeout: 180000 });
const back = await page.getByText("SC-0413").first().waitFor({ timeout: 90000 }).then(() => true, () => false);
await shot(page, "b-3-table-back-with-its-records");
check("the table page opens again with its records (SC-0413 visible)", back);

// 4. Archive again; Organization Trash lists it; Restore there.
check("archived again from the table page", await archiveFromPage("c"));
await page.goto(`${ORIGIN}/organizations/${ORG_SLUG}/settings#trash`, { waitUntil: "domcontentloaded", timeout: 180000 });
const section = page.locator("section#trash");
await section.waitFor({ timeout: 90000 });
await section.scrollIntoViewIfNeeded();
const orow = section.locator("li").filter({ hasText: NAME }).first();
const olisted = await orow.waitFor({ timeout: 60000 }).then(() => true, () => false);
await shot(page, "d-1-organization-trash-lists-table");
check("Organization Trash (Harbor Dental Group settings) lists the table", olisted);
if (olisted) {
  await orow.getByRole("button", { name: /Restore/ }).click({ timeout: 15000 });
  const ogone = await until("row leaves org Trash", async () => (await section.locator("li").filter({ hasText: NAME }).count()) === 0, 30000);
  await shot(page, "d-2-organization-trash-after-restore");
  check("Restore in Organization Trash removes it from Trash", !!ogone.v);
}
await page.goto(`${ORIGIN}/data-v2/${tableId}`, { waitUntil: "domcontentloaded", timeout: 180000 });
const back2 = await page.getByText("SC-0412").first().waitFor({ timeout: 90000 }).then(() => true, () => false);
await shot(page, "d-3-table-back-again");
check("the table page opens again after the organization restore", back2);

// 5. Leave it archived (archive, never delete).
const done = await rpc("table_archive", { p_organization_id: ORG, p_table_id: tableId, p_chunk: 50, p_include_table: true });
check("disposable table archived again at the end", done?.done === true, done?.message);

await browser.close();
writeFileSync(`${OUT}/walk.txt`, results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " — " + r.detail : ""}`).join("\n") + "\n");
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
