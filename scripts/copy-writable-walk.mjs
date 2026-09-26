// scripts/copy-writable-walk.mjs — lane COPY-WRITABLE headless proof on admin@admin.com's own copied,
// unswitched table (Rincon Plumbing — Service Calls in admin's Workspace).
//
// On /data-v2/<table>: the table menu (⋯) carries the test-copy line; choosing it tells who still
// writes the older table and how much has been changed here. With EDIT=1 the walk changes one cell
// as the person (a test write) and puts it back, then re-reads the menu line's detail.
//
//   ORIGIN=<site> TABLE=<id> SHOTS=<dir> [EDIT=1] node scripts/copy-writable-walk.mjs
//
// Prints a JSON verdict; exit 1 on any miss.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://copy-writable.localhost:3001";
const TABLE = process.env.TABLE ?? "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const SHOTS = process.env.SHOTS ?? "/tmp";
const EDIT = process.env.EDIT === "1";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const out = { origin: ORIGIN, table: TABLE };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

async function readMenuLine(label) {
  await page.locator("[data-table-menu]").first().click();
  const item = page.locator('[data-table-menu-extra="test-copy"]').first();
  const seen = await until("test-copy item", () => item.isVisible(), 30000).catch(() => ({ v: false }));
  const r = { item_shown: !!seen?.v };
  if (r.item_shown) {
    r.item_text = (await item.innerText()).trim();
    await page.screenshot({ path: join(SHOTS, `copy-writable-menu-${label}.png`) });
    await item.click();
    const toast = page.locator("[data-sonner-toast]").last();
    await until("toast", () => toast.isVisible(), 20000).catch(() => null);
    r.toast_text = (await toast.innerText().catch(() => "")).trim();
    await page.screenshot({ path: join(SHOTS, `copy-writable-toast-${label}.png`) });
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(800);
  } else {
    r.menu_items = await page.locator("[role=menuitem]").allInnerTexts().catch(() => []);
    await page.keyboard.press("Escape").catch(() => {});
  }
  return r;
}

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("table menu", () => page.locator("[data-table-menu]").first().isVisible(), 180000);
  await sleep(3000);
  await page.screenshot({ path: join(SHOTS, "copy-writable-page.png") });
  out.before = await readMenuLine("before");
  if (EDIT) {
    // The person's test write: the last work order's number, changed and put back.
    const cell = page.getByText(process.env.CELL ?? "WO-4475", { exact: true }).first();
    await until("the cell", () => cell.isVisible(), 60000);
    const original = (await cell.innerText()).trim();
    out.edit = { original };
    const changed = process.env.CHANGED ?? "WO-4476";
    await cell.dblclick();
    await sleep(800);
    await page.screenshot({ path: join(SHOTS, "copy-writable-editing.png") });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type(changed);
    await page.keyboard.press("Enter");
    await sleep(3000);
    const edited = page.getByText(changed, { exact: true }).first();
    out.edit.changed_to = changed;
    out.edit.shown = await edited.isVisible().catch(() => false);
    out.edit.refused = await page.locator("text=/older table is still the one in use/i").first().isVisible().catch(() => false);
    await page.screenshot({ path: join(SHOTS, "copy-writable-edited.png") });
    await page.reload({ waitUntil: "domcontentloaded" });
    await until("table menu", () => page.locator("[data-table-menu]").first().isVisible(), 180000);
    await sleep(3000);
    out.after = await readMenuLine("after");
    out.edit.shown_after_reload = await page.getByText(changed, { exact: true }).first().isVisible().catch(() => false);
    // Put it back (the person's second write to the same row; the note counts it).
    if (out.edit.shown_after_reload) {
      await page.getByText(changed, { exact: true }).first().dblclick();
      await sleep(800);
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await page.keyboard.type(original);
      await page.keyboard.press("Enter");
      await sleep(3000);
      out.edit.put_back = await page.getByText(original, { exact: true }).first().isVisible().catch(() => false);
    }
  }
} catch (error) {
  out.error = String(error?.message ?? error);
  await page.screenshot({ path: join(SHOTS, "copy-writable-error.png") }).catch(() => {});
} finally {
  await browser.close();
}
out.verdict =
  !out.error && out.before?.item_shown && /Test copy/.test(out.before.item_text ?? "") &&
  (!EDIT || (out.edit && out.edit.shown && !out.edit.refused && out.edit.shown_after_reload && out.after?.item_shown && /1 row/.test(out.after.toast_text ?? "")))
    ? "PASS" : "FAIL";
console.log(JSON.stringify(out, null, 2));
process.exit(out.verdict === "PASS" ? 0 : 1);
