// scripts/big-values-live-walk.mjs — lane BIG-VALUES-LIVE headless proof on a table read from the store.
//
// A value too big for one cell is kept as a file and the cell holds its first words. On
// /data-v2/<table>, as admin@admin.com: the cell shows the head text and "Open the whole text",
// and that link opens the file's own page as the person.
//
//   ORIGIN=<site> TABLE=<store table id> FILE=<file id> FILE_NAME=<name> SHOTS=<dir> node scripts/big-values-live-walk.mjs
//
// Reads only. Prints a JSON verdict; exit 1 on any miss.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://big-values-live.localhost:3001";
const { TABLE, FILE, FILE_NAME } = process.env;
const SHOTS = process.env.SHOTS ?? "/tmp";
if (!TABLE || !FILE) throw new Error("TABLE and FILE are required");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const tag = new URL(ORIGIN).hostname.split(".")[0];
const out = { origin: ORIGIN, table: TABLE, file: FILE };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const cell = page.locator(`[data-whole-value-file="${FILE}"]`).first();
  const anyCell = page.locator("[data-whole-value-file]").first();
  const grid = page.getByRole("button", { name: /^Grid$/ }).first();
  await until("grid or cell", async () => (await cell.isVisible().catch(() => false)) || (await grid.isVisible().catch(() => false)), 120000).catch(() => null);
  if (!(await cell.isVisible().catch(() => false)) && (await grid.isVisible().catch(() => false))) await grid.click();
  const seen = await until("pointer cell", () => cell.isVisible(), 90000).catch(() => ({ v: false }));
  out.pointer_cell_drawn = !!seen?.v;
  out.any_pointer_cells = await anyCell.count();
  if (out.pointer_cell_drawn) {
    await cell.scrollIntoViewIfNeeded().catch(() => {});
    const text = await cell.innerText();
    out.cell_head = text.slice(0, 80);
    out.cell_tail = text.slice(-60);
    const link = cell.getByText(/Open the whole text/).first();
    out.says_open_the_whole_text = await link.isVisible().catch(() => false);
    const a = cell.locator("a").first();
    out.cell_link = (await a.count()) ? await a.getAttribute("href") : null;
  }
  out.cell_screenshot = join(SHOTS, `${tag}-cell.png`);
  await page.screenshot({ path: out.cell_screenshot });
  // The file's own page, as the person — through the cell's link, or (when no pointer cell is
  // drawn) directly, so the report says which half failed.
  out.file_page_opened_from = out.cell_link ? "the cell's link" : "its address (no link was drawn)";
  {
    const file = await context.newPage();
    const link = out.cell_link ?? `/files/f/${FILE}`;
    const href = link.startsWith("http") ? link : `${ORIGIN}${link}`;
    const res = await file.goto(href, { waitUntil: "domcontentloaded", timeout: 180000 });
    out.file_page_status = res?.status() ?? null;
    out.file_page_url = file.url();
    out.file_page_names_file = FILE_NAME
      ? await until("file name", () => file.locator(`text=${FILE_NAME}`).first().isVisible(), 90000).then((r) => !!r.v).catch(() => false)
      : null;
    out.file_page_denied = await file.locator("text=/don't have access|not allowed|was deleted/i").first().isVisible().catch(() => false);
    out.file_screenshot = join(SHOTS, `${tag}-file-page.png`);
    await file.screenshot({ path: out.file_screenshot });
    await file.close();
  }
} catch (error) {
  out.error = String(error?.message ?? error);
  await page.screenshot({ path: join(SHOTS, `${tag}-error.png`) }).catch(() => {});
} finally {
  await browser.close();
}
out.verdict =
  out.pointer_cell_drawn && out.says_open_the_whole_text && out.cell_link && out.file_page_status === 200 && !out.file_page_denied && out.file_page_names_file !== false
    ? "GREEN"
    : "RED";
console.log(JSON.stringify(out, null, 2));
process.exit(out.verdict === "GREEN" ? 0 : 1);
