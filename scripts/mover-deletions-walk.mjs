// scripts/mover-deletions-walk.mjs — lane MOVER-DELETIONS, from a real seat.
//
// Signs in as admin@admin.com through the app's own login form (scripts/lib/seat-browser.mjs,
// headless) on the shared preview (live database) and walks admin's test organization
// "Harbor Dental Group" (11f4e747…), whose pick list "Insurance Carriers" moved with its switch:
//
//   PHASE=switch-back  the Data tables card → Switch back (the older list is live again)
//   PHASE=delete       the front desk takes "Aetna DMO" off the older list (the older editor's own
//                      delete: the item's deleted_at), then the card names it:
//                      "Nothing removed from an older table or list is still on its copy"
//   PHASE=press        Copy again, then Switch to the new system
//   PHASE=look         the list, now in the new system, has no Aetna DMO (door + page, 1600 and 390)
//
//   ORIGIN=http://mover-deletions.localhost:3001 PHASE=look SHOTS=<dir> node scripts/mover-deletions-walk.mjs
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://mover-deletions.localhost:3001";
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

const REMOVED = "Aetna DMO";
const checkLine = () => card().innerText().catch(() => "");

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
  } else if (PHASE === "delete") {
    const items = await client.schema("workbench").from("udt_structured_list_items")
      .select("id, label, deleted_at").eq("list_id", LIST);
    const target = (items.data ?? []).find((i) => i.label === REMOVED && !i.deleted_at);
    step("older choices", { error: items.error?.message ?? null, labels: (items.data ?? []).filter((i) => !i.deleted_at).map((i) => i.label) });
    if (!target) throw new Error(`no live older choice "${REMOVED}"`);
    // The older list editor's own delete (features/user-lists/service.ts deleteItem).
    const gone = await client.schema("workbench").from("udt_structured_list_items")
      .update({ deleted_at: new Date().toISOString() }).eq("id", target.id).select("id");
    step("the older choice deleted (the older editor's own door)", { error: gone.error?.message ?? null, id: target.id });
    out.removed_choice = target.id;
    await openSettings();
    await until("the card names it", async () => /removed on the older side/.test(await checkLine()), 120000);
    out.card = await card().innerText();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await sleep(1500);
      await card().scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: join(SHOTS, `2-card-names-the-removal-${width}.png`), fullPage: width < 600 });
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
  } else if (PHASE === "press") {
    await openSettings();
    out.card_before = await card().innerText();
    // SKIP_COPY=1: the copy was already made by the mover's terminal rerun (the same COPY the
    // button runs) — used while the deployed server predates this lane's mover change.
    if (process.env.SKIP_COPY !== "1") await button("Copy again").click();
    await until("copy done", async () => !(await page.getByText("Copying the older tables again").isVisible().catch(() => false)), 600000);
    await sleep(6000);
    out.card_after_copy = await card().innerText();
    out.copy_toast = (await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).join(" | ");
    await page.screenshot({ path: join(SHOTS, "3-after-copy-again.png") });
    await button("Switch to the new system").click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("confirm", () => dialog.isVisible(), 20000);
    await dialog.getByRole("button", { name: "Switch to the new system" }).click();
    await until("switched", async () => /New system|refused|Not ready/i.test(await checkLine()), 240000);
    await sleep(3000);
    out.card_after_switch = await card().innerText();
    await page.screenshot({ path: join(SHOTS, "4-switched-to-new.png") });
  } else if (PHASE === "look") {
    const home = await client.schema("custom").rpc("where_lists_live", { p_list_ids: [LIST] });
    step("custom.where_lists_live", { error: home.error?.message ?? null, answer: home.data });
    const detail = await client.rpc("get_user_list_with_items", { p_list_id: LIST });
    const labels = Object.values(detail.data?.items_grouped ?? {}).flat().map((i) => i.label);
    step("get_user_list_with_items (from the copy)", { error: detail.error?.message ?? null, lives_in: detail.data?.lives_in, labels, has_removed: labels.includes(REMOVED) });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await page.goto(`${ORIGIN}/lists/${LIST}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await until("the table page", async () => (await text()).includes("Delta Dental PPO"), 180000);
      await sleep(3000);
      await page.screenshot({ path: join(SHOTS, `5-list-in-the-new-system-without-the-choice-${width}.png`) });
      step(`/lists/<id> @${width}`, { shows_removed: (await text()).includes(REMOVED), shows_delta: (await text()).includes("Delta Dental PPO") });
    }
  }
} catch (err) {
  out.error = String(err?.stack ?? err).slice(0, 1500);
  await page.screenshot({ path: join(SHOTS, `error-${PHASE}.png`) }).catch(() => {});
} finally {
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
