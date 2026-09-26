// scripts/lists-after-switch-walk.mjs — lane LISTS-AFTER-SWITCH, from a real seat.
//
// Signs in as admin@admin.com through the app's own login form (scripts/lib/seat-browser.mjs,
// headless) on the shared preview (live database) and walks admin's switched test organization
// "Harbor Dental Group" (11f4e747…):
//
//   PHASE=switch-back  the Data tables card → Switch back (so an older pick list can be made)
//   PHASE=seed         make the older pick list "Insurance Carriers" through create_user_list as
//                      admin (the org is on the older system, so it is born older)
//   PHASE=press        Copy again, then Switch to the new system (the press archives the list)
//   PHASE=look         the list doors as admin (where_lists_live, get_user_lists_summary,
//                      get_user_list_with_items), then the screens: /lists/v3 lists it "In the new
//                      system", clicking it opens /lists/<id> as the new table page, a choice added
//                      on that page reads back from the copy, "New picklist" makes a list in the
//                      store, and an older table/list INSERT is refused naming the new system.
//
//   ORIGIN=http://lists-after-switch.localhost:3001 PHASE=look SHOTS=<dir> node scripts/lists-after-switch-walk.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://lists-after-switch.localhost:3001";
const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"; // Harbor Dental Group (admin's test org)
const LIST_NAME = "Insurance Carriers";
const SHOTS = process.env.SHOTS ?? "/tmp";
const PHASE = process.env.PHASE ?? "look";
const WIDTHS = (process.env.WIDTHS ?? "1600,390").split(",").map(Number);
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

const out = { origin: ORIGIN, organization: ORG, phase: PHASE, steps: [], console_errors: [] };
const step = (name, result) => out.steps.push({ name, ...result });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 240)));
const text = async () => (await page.locator("body").innerText().catch(() => "")).replace(/\s+\n/g, "\n");
const button = (label) => page.getByRole("button", { name: label, exact: true }).first();
const card = () => page.locator("li", { has: page.locator("h3", { hasText: "Data tables" }) }).first();

async function openSettings() {
  await page.goto(`${ORIGIN}/organizations/${ORG}/settings#data`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("settings card", async () => (await card().innerText().catch(() => "")).includes("Data tables"), 180000);
  await sleep(2000);
}

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);
  const session = sessionFromCookies(await context.cookies());
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  const me = (await client.auth.getUser(session.access_token)).data?.user;
  out.token_is = me?.email;

  if (PHASE === "switch-back") {
    await openSettings();
    out.card_before = await card().innerText();
    await button("Switch back").click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("confirm", () => dialog.isVisible(), 20000);
    const box = dialog.locator("input[type=checkbox],button[role=checkbox]").first();
    if (await box.isVisible().catch(() => false)) await box.click();
    await dialog.getByRole("button", { name: "Switch back" }).click();
    await until("switched back", async () => /Old system/.test(await card().innerText().catch(() => "")), 240000);
    await sleep(2000);
    out.card_after = await card().innerText();
    await page.screenshot({ path: join(SHOTS, "press-switched-back.png") });
  } else if (PHASE === "seed") {
    const made = await client.rpc("create_user_list", {
      p_list_name: LIST_NAME,
      p_description: "The dental plans the front desk verifies before a visit.",
      p_user_id: me.id,
      p_is_public: false,
      p_authenticated_read: false,
      p_public_read: false,
      p_items: [
        { Label: "Delta Dental PPO", Group: "PPO", "Help Text": "Verify frequency limits for cleanings" },
        { Label: "MetLife PDP", Group: "PPO" },
        { Label: "Cigna DPPO", Group: "PPO" },
        { Label: "Guardian DentalGuard", Group: "PPO" },
        { Label: "Aetna DMO", Group: "HMO", "Help Text": "Assigned-office plan; check the patient's chosen office" },
      ],
      p_organization_id: ORG,
    });
    step("create_user_list (older org)", { error: made.error?.message ?? null, list_id: made.data?.list_id, lives_in: made.data?.lives_in, items: made.data?.items?.length });
  } else if (PHASE === "press") {
    await openSettings();
    out.card_before = await card().innerText();
    if (await button("Copy again").isVisible().catch(() => false)) {
      await button("Copy again").click();
      await until("copy done", async () => !(await page.getByText("Copying the older tables again").isVisible().catch(() => false)), 600000);
      await sleep(5000);
      out.card_after_copy = await card().innerText();
    }
    await button("Switch to the new system").click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("confirm", () => dialog.isVisible(), 20000);
    await dialog.getByRole("button", { name: "Switch to the new system" }).click();
    await until("switched", async () => /New system|refused|Not ready/i.test(await card().innerText().catch(() => "")), 240000);
    await sleep(3000);
    out.card_after_switch = await card().innerText();
    await page.screenshot({ path: join(SHOTS, "press-switched-to-new.png") });
  } else {
    // ── the doors, as admin ──
    const summary = await client.rpc("get_user_lists_summary", { p_user_id: me.id });
    const entry = (summary.data ?? []).find((l) => l.list_name === LIST_NAME && l.lives_in === "record");
    step("get_user_lists_summary", { error: summary.error?.message ?? null, found: entry ?? null });
    if (!entry) throw new Error(`"${LIST_NAME}" is not listed in the new system`);
    const LIST = entry.list_id;
    out.list_id = LIST;
    const home = await client.schema("custom").rpc("where_lists_live", { p_list_ids: [LIST] });
    step("custom.where_lists_live", { error: home.error?.message ?? null, answer: home.data });
    const detail = await client.rpc("get_user_list_with_items", { p_list_id: LIST });
    step("get_user_list_with_items", {
      error: detail.error?.message ?? null,
      lives_in: detail.data?.lives_in,
      groups: Object.fromEntries(Object.entries(detail.data?.items_grouped ?? {}).map(([g, items]) => [g, items.map((i) => i.label)])),
    });
    const olderList = await client.schema("workbench").from("udt_structured_lists").insert({
      list_name: "Operatory Rooms", organization_id: ORG, user_id: me.id, created_by: me.id, visibility: "personal",
    });
    step("direct older list insert in the switched org", { refused: !!olderList.error, says: olderList.error?.message ?? null });
    const olderTable = await client.rpc("create_user_table_with_fields", {
      p_table_name: "Sterilization Log", p_description: "Autoclave cycles per operatory", p_is_public: false,
      p_organization_id: ORG, p_project_id: null, p_task_id: null,
      p_fields: [{ field_name: "cycle_date", display_name: "Cycle date", data_type: "date" }],
    });
    step("create_user_table_with_fields in the switched org", { refused: !!olderTable.error, says: olderTable.error?.message ?? null });

    // ── the screens ──
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await page.goto(`${ORIGIN}/lists/v3`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await until("lists manager", async () => (await text()).includes(LIST_NAME), 120000);
      await sleep(2000);
      await page.screenshot({ path: join(SHOTS, `fixed-lists-v3-${width}.png`) });
      step(`/lists/v3 @${width}`, { shows_list: (await text()).includes(LIST_NAME), says_new_system: (await text()).includes("In the new system") });
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole("button", { name: new RegExp(LIST_NAME) }).first().click();
    await until("opened at its address", async () => page.url().includes(`/lists/${LIST}`), 60000);
    await until("the table page", async () => (await text()).includes("now lives in the new system") && (await text()).includes("Delta Dental PPO"), 180000);
    await sleep(3000);
    await page.screenshot({ path: join(SHOTS, "fixed-list-opens-as-table-page-1600.png") });
    step("click → /lists/<id>", { url: page.url(), line: (await text()).includes("This list now lives in the new system") });

    // an edit on the copy (the store's own write door, the same one the table page's add-row uses)
    const added = await client.schema("custom").rpc("record_write", {
      p_organization_id: ORG, p_table_id: LIST, p_data: { name: "United Concordia", group_name: "PPO" },
    });
    step("a choice added on the copy (custom.record_write)", { error: added.error?.message ?? null, record: added.data });
    const after = await client.rpc("get_user_list_with_items", { p_list_id: LIST });
    step("the list reads it back from the copy", { ppo: (after.data?.items_grouped?.PPO ?? []).map((i) => i.label) });
    await page.reload({ waitUntil: "domcontentloaded" });
    await until("the new choice on the page", async () => (await text()).includes("United Concordia"), 180000);
    await sleep(2000);
    await page.screenshot({ path: join(SHOTS, "fixed-list-edited-on-the-copy-1600.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(2500);
    await page.screenshot({ path: join(SHOTS, "fixed-list-opens-as-table-page-390.png") });
    if (added.data) {
      const archived = await client.schema("custom").rpc("record_delete", { p_organization_id: ORG, p_record_id: added.data });
      step("the added choice archived again (soft)", { error: archived.error?.message ?? null });
    }

    // a NEW list from the manager is born in the new system
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${ORIGIN}/lists/v3`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("lists manager", async () => (await text()).includes(LIST_NAME), 120000);
    await sleep(1500);
    await page.getByRole("button", { name: /New picklist/ }).first().click();
    await until("the new list's page", async () => /\/lists\/[0-9a-f-]{36}$/.test(page.url()), 60000);
    const NEW = page.url().split("/").pop();
    await until("new list table page", async () => (await text()).includes("now lives in the new system"), 180000);
    await sleep(2500);
    await page.screenshot({ path: join(SHOTS, "fixed-new-list-born-in-the-new-system-1600.png") });
    const newHome = await client.schema("custom").rpc("where_lists_live", { p_list_ids: [NEW] });
    const olderRow = await client.schema("workbench").from("udt_structured_lists").select("id").eq("id", NEW).maybeSingle();
    step("New picklist → born in the new system", { id: NEW, where: newHome.data, older_row: olderRow.data ?? null });
    out.new_list_id = NEW;
  }
} catch (e) {
  out.error = String(e?.message ?? e);
  await page.screenshot({ path: join(SHOTS, `error-${PHASE}.png`) }).catch(() => undefined);
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}
