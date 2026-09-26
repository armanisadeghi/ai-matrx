// scripts/list-copy-permissive-walk.mjs — lane LIST-COPY-PERMISSIVE, from a real seat.
//
// Signs in as admin@admin.com through the app's own login form (scripts/lib/seat-browser.mjs,
// headless) on the shared preview (live database) and walks admin's test organization
// "Harbor Dental Group" (11f4e747…). The front desk records each patient's insurance carrier on
// "Hygiene Recall Schedule", choosing from the pick list "Insurance Carriers" — and, as the older
// grid always allowed, one patient's carrier is typed in though it is not on the list.
//
//   PHASE=switch-back  the Data tables card → Switch back (the older tables and list are live again)
//   PHASE=plant        on the older table, through the older doors: an "Insurance carrier" column
//                      choosing from "Insurance Carriers", one row on the list, one row OFF it
//   (then the copy: Copy again, or the mover's terminal rerun while the deployed server predates
//    this lane — `runner --organization 11f4e747… --table <id> --apply --i-know-this-writes`)
//   PHASE=press        (SKIP_COPY=1 skips the button) → Switch to the new system
//   PHASE=look         the table in the new system keeps the off-list carrier as an other value; the
//                      list in the new system has no invented choice (door + page, 1600 and 390)
//
//   ORIGIN=http://list-copy-permissive.localhost:3001 PHASE=look SHOTS=<dir> node scripts/list-copy-permissive-walk.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://list-copy-permissive.localhost:3001";
const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"; // Harbor Dental Group (admin's test org)
const TABLE = "b00bde4d-1adc-4682-88eb-57453aabf014"; // Hygiene Recall Schedule
const LIST_NAME = "Insurance Carriers";
const OFF_LIST = "Guardian Dental PPO"; // typed by the front desk; not on the list
const ON_LIST = "Delta Dental PPO";
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
const checkLine = () => card().innerText().catch(() => "");

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
  const summary = await client.rpc("get_user_lists_summary", { p_user_id: me.id });
  const entry = (summary.data ?? []).find((l) => l.list_name === LIST_NAME);
  if (!entry) throw new Error(`"${LIST_NAME}" is not among admin's lists`);
  const LIST = entry.list_id;
  out.list = { id: LIST, lives_in: entry.lives_in, items: entry.item_count };

  if (PHASE === "switch-back") {
    await openSettings();
    out.card_before = await card().innerText();
    await button("Switch back").click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("confirm", () => dialog.isVisible(), 20000);
    const box = dialog.locator("input[type=checkbox],button[role=checkbox]").first();
    if (await box.isVisible().catch(() => false)) await box.click();
    await dialog.getByRole("button", { name: "Switch back" }).click();
    await until("switched back", async () => /Old system/.test(await checkLine()), 240000);
    await sleep(2000);
    out.card_after = await card().innerText();
    await page.screenshot({ path: join(SHOTS, "1-switched-back.png") });
  } else if (PHASE === "plant") {
    const items = await client.schema("workbench").from("udt_structured_list_items")
      .select("label, deleted_at").eq("list_id", LIST);
    const labels = (items.data ?? []).filter((i) => !i.deleted_at).map((i) => i.label);
    step("the older list's choices", { error: items.error?.message ?? null, labels });
    if (labels.includes(OFF_LIST)) throw new Error(`"${OFF_LIST}" is already on the list`);
    // The older grid's own doors (features/data-tables/service.ts → utils/user-table-utls/table-utils.ts).
    const col = await client.rpc("add_column_to_user_table", {
      p_table_id: TABLE, p_field_name: "insurance_carrier", p_display_name: "Insurance carrier",
      p_data_type: "string", p_is_required: false, p_default_value: null,
    });
    step("add_column_to_user_table", { error: col.error?.message ?? null, data: col.data });
    const fields = await client.schema("workbench").from("udt_dataset_fields")
      .select("id, field_name").eq("table_id", TABLE);
    const field = (fields.data ?? []).find((f) => f.field_name === "insurance_carrier");
    if (!field) throw new Error("the Insurance carrier column is not on the older table");
    const fmt = await client.rpc("udt_set_field_format", {
      p_table_id: TABLE, p_field_id: field.id,
      p_format: { id: "choice", options: { structuredList: { listId: LIST } } },
    });
    step("udt_set_field_format (choice from Insurance Carriers)", { error: fmt.error?.message ?? null, data: fmt.data });
    const rows = await client.schema("workbench").from("udt_dataset_rows")
      .select("id, data").eq("table_id", TABLE).is("deleted_at", null).order("created_at");
    const live = rows.data ?? [];
    if (live.length < 2) throw new Error("the older table has fewer than two live rows");
    for (const [row, value] of [[live[0], ON_LIST], [live[1], OFF_LIST]]) {
      const cell = await client.rpc("udt_upsert_cell", {
        p_table_id: TABLE, p_row_id: row.id, p_field_name: "insurance_carrier", p_value: value,
      });
      step(`udt_upsert_cell ${row.data?.patient ?? row.id} = ${value}`, { error: cell.error?.message ?? null });
    }
    out.off_list_row = live[1].id;
  } else if (PHASE === "press") {
    await openSettings();
    out.card_before = await card().innerText();
    if (process.env.SKIP_COPY !== "1") await button("Copy again").click();
    await until("copy done", async () => !(await page.getByText("Copying the older tables again").isVisible().catch(() => false)), 600000);
    await sleep(6000);
    out.card_after_copy = await card().innerText();
    await page.screenshot({ path: join(SHOTS, "2-card-before-the-switch.png") });
    await button("Switch to the new system").click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("confirm", () => dialog.isVisible(), 20000);
    await dialog.getByRole("button", { name: "Switch to the new system" }).click();
    await until("switched", async () => /New system|refused|Not ready/i.test(await checkLine()), 240000);
    await sleep(3000);
    out.card_after_switch = await card().innerText();
    await page.screenshot({ path: join(SHOTS, "3-switched-to-new.png") });
  } else if (PHASE === "look") {
    const detail = await client.rpc("get_user_list_with_items", { p_list_id: LIST });
    const labels = Object.values(detail.data?.items_grouped ?? {}).flat().map((i) => i.label);
    step("get_user_list_with_items (the list in the new system)", {
      error: detail.error?.message ?? null, lives_in: detail.data?.lives_in, labels, invented: labels.includes(OFF_LIST),
    });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await page.goto(`${ORIGIN}/data/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await until("the table page", async () => (await text()).includes(OFF_LIST), 180000).catch(() => {});
      await sleep(4000);
      await page.screenshot({ path: join(SHOTS, `4-table-keeps-the-other-value-${width}.png`) });
      step(`/data/<id> @${width}`, { shows_off_list: (await text()).includes(OFF_LIST), shows_on_list: (await text()).includes(ON_LIST) });
      await page.goto(`${ORIGIN}/lists/${LIST}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await until("the list page", async () => (await text()).includes(ON_LIST), 180000);
      await sleep(3000);
      await page.screenshot({ path: join(SHOTS, `5-list-has-no-invented-choice-${width}.png`) });
      step(`/lists/<id> @${width}`, { shows_off_list: (await text()).includes(OFF_LIST), shows_on_list: (await text()).includes(ON_LIST) });
    }
  }
} catch (err) {
  out.error = String(err?.stack ?? err).slice(0, 1500);
  await page.screenshot({ path: join(SHOTS, `error-${PHASE}.png`) }).catch(() => {});
} finally {
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
