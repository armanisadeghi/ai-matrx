// scripts/switch-back-carries-walk.mjs — lane SWITCH-BACK-CARRIES headless walk, as admin@admin.com, on
// admin's own test organization "Harbor Dental Group" (switched to the new system; left switched).
//
//   PHASE=edit   — /data/<table> (the new table page): change one cell of the copy; then /data →
//                  Create Table: a table made in the new system while switched.
//   PHASE=back   — /organizations/<org>/settings#data: Switch back; records the dialog's sentences
//                  word for word, confirms, records what the card said; then /data (1600, 390) and
//                  /data/<table> (the older viewer) to see both survive.
//   PHASE=again  — Switch to the new system again; records the card; /data and /data/<table>.
//
//   ORIGIN=http://switch-back-carries.localhost:3001 PHASE=edit SHOTS=<dir> node scripts/switch-back-carries-walk.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep, setOrganization } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://switch-back-carries.localhost:3001";
const ORG = process.env.ORG ?? "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const ORG_NAME = process.env.ORG_NAME ?? "Harbor Dental Group";
const TABLE = process.env.TABLE ?? "b00bde4d-1adc-4682-88eb-57453aabf014";
const ROW_TEXT = process.env.ROW_TEXT ?? "Theo Brannigan";
const OLD_VALUE = process.env.OLD_VALUE ?? "Marisol";
const NEW_VALUE = process.env.NEW_VALUE ?? "Priya Shah";
const NEW_TABLE = process.env.NEW_TABLE ?? "Hygiene Supply Reorders";
const SHOTS = process.env.SHOTS ?? "/tmp";
const PHASE = process.env.PHASE ?? "back";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const out = { origin: ORIGIN, org: ORG, table: TABLE, phase: PHASE, pages: {}, console_errors: [], calls: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 240)));
let calls = [];
page.on("request", (req) => {
  const m = req.url().match(/\/rest\/v1\/(rpc\/)?([A-Za-z0-9_]+)/);
  if (!m) return;
  const schema = req.headers()["content-profile"] ?? req.headers()["accept-profile"] ?? "public";
  calls.push(`${m[1] ? "rpc " : "table "}${schema}.${m[2]}`);
});
const text = async () => (await page.locator("body").innerText().catch(() => "")).replace(/\s+\n/g, "\n").slice(0, 5000);
const button = (label) => page.getByRole("button", { name: label, exact: true }).first();
const shot = (name) => page.screenshot({ path: join(SHOTS, `${PHASE}-${name}.png`), fullPage: false });
const card = () => page.locator("li", { has: page.locator("h3", { hasText: "Data tables" }) }).first();

async function visit(key, path, wait, width) {
  calls = [];
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until(key, wait, 120000);
  await sleep(3000);
  await shot(`${key}-${width}`);
  out.pages[`${key}@${width}`] = { path, text: await text(), calls: [...new Set(calls)] };
}

async function openSettings() {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${ORIGIN}/organizations/${ORG}/settings#data`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("Check again", () => button("Check again").isVisible(), 180000);
  await sleep(2000);
  await card().scrollIntoViewIfNeeded().catch(() => undefined);
}

const homeLoaded = async () => !(await page.getByText("Loading", { exact: false }).first().isVisible().catch(() => false));

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);
  await setOrganization(page, ORG_NAME).catch((e) => (out.set_org = String(e?.message ?? e)));

  if (PHASE === "edit") {
    await visit("table-before-edit", `/data/${TABLE}`, async () => (await text()).includes(ROW_TEXT), 1600);
    const row = page.locator("tr, [role=row]", { hasText: ROW_TEXT }).first();
    const cell = row.locator("td, [role=gridcell], [role=cell]", { hasText: OLD_VALUE }).first();
    await cell.dblclick();
    await sleep(800);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type(NEW_VALUE);
    await page.keyboard.press("Enter");
    await sleep(4000);
    await shot("table-after-edit-1600");
    out.row_after_edit = await row.innerText().catch(() => null);
    out.edit_calls = [...new Set(calls)];

    await visit("home-before-create", "/data", homeLoaded, 1600);
    await button("Create Table").click();
    await until("create dialog", () => page.locator("#tableName").isVisible(), 20000);
    await page.locator("#tableName").fill(NEW_TABLE);
    await page.locator("#description").fill("Gloves, prophy paste and bibs to reorder for the hygiene rooms.").catch(() => undefined);
    await sleep(1500);
    calls = [];
    await page.getByRole("dialog").getByRole("button", { name: "Create Table", exact: true }).click();
    await sleep(8000);
    out.create_calls = [...new Set(calls)];
    await shot("after-create-1600");
    out.after_create_text = await text();
  } else if (PHASE === "archive") {
    // Archive ONE of admin's own tables through the home's own delete control (Trash keeps it).
    const name = process.env.ARCHIVE_NAME;
    if (!name) throw new Error("ARCHIVE_NAME is required");
    await visit("home-before-archive", "/data", homeLoaded, 1600);
    const cardEl = page.locator("div", { has: page.getByText(name, { exact: true }) })
      .filter({ has: page.locator("button[title='Delete table']") }).last();
    await cardEl.locator("button[title='Delete table']").first().click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("delete confirm", () => dialog.isVisible(), 20000);
    out.archive_dialog = await dialog.innerText();
    await dialog.getByRole("button", { name: "Delete Table" }).click();
    await sleep(5000);
    await shot("home-after-archive-1600");
    out.after_archive_text = (await text()).slice(0, 1500);
  } else if (PHASE === "back") {
    await openSettings();
    out.card_before = await card().innerText();
    await shot("card-before");
    await card().getByRole("button", { name: "Switch back", exact: true }).click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("confirm", () => dialog.isVisible(), 20000);
    await sleep(1000);
    out.dialog = await dialog.innerText();
    await dialog.screenshot({ path: join(SHOTS, `${PHASE}-dialog.png`) });
    const leave = dialog.locator("[data-testid=switch-back-leave-behind]");
    out.dialog_needs_confirm = await leave.isVisible().catch(() => false);
    if (out.dialog_needs_confirm) {
      out.confirm_disabled_before_tick = await dialog.getByRole("button", { name: "Switch back" }).isDisabled();
      await leave.click();
      await sleep(500);
      await dialog.screenshot({ path: join(SHOTS, `${PHASE}-dialog-ticked.png`) });
    }
    await dialog.getByRole("button", { name: "Switch back" }).click();
    await until("switched back", async () => /Switched back|refused|Not ready|stopped/i.test(await card().innerText().catch(() => "")), 180000);
    await sleep(3000);
    out.card_after = await card().innerText();
    await shot("card-after");
    for (const width of [1600, 390]) {
      await visit("home", "/data", homeLoaded, width);
      await visit("table", `/data/${TABLE}`, async () => (await text()).includes(ROW_TEXT), width);
    }
  } else if (PHASE === "again") {
    await openSettings();
    out.card_before = await card().innerText();
    const sw = card().getByRole("button", { name: "Switch to the new system", exact: true });
    if (!(await sw.isVisible().catch(() => false))) throw new Error("the Data tables switch is not offered");
    await sw.click();
    const dialog = page.locator("[role=dialog],[role=alertdialog]").last();
    await until("confirm", () => dialog.isVisible(), 20000);
    out.dialog = await dialog.innerText();
    await dialog.getByRole("button", { name: "Switch to the new system" }).click();
    await until("switched", async () => /Switched to|Not ready|refused|stopped/i.test(await card().innerText().catch(() => "")), 180000);
    await sleep(3000);
    out.card_after = await card().innerText();
    await shot("card-after");
    for (const width of [1600, 390]) {
      await visit("home", "/data", homeLoaded, width);
      await visit("table", `/data/${TABLE}`, async () => (await text()).includes(ROW_TEXT), width);
    }
  }
} catch (e) {
  out.error = String(e?.message ?? e);
  await page.screenshot({ path: join(SHOTS, `${PHASE}-error.png`) }).catch(() => undefined);
} finally {
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}
