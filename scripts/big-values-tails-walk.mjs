// scripts/big-values-tails-walk.mjs — lane BIG-VALUES-TAILS headless proof.
//
// A value too big for one cell is kept as a file and the cell holds its first words. On
// /data-v2/<table>, as admin@admin.com, on the shared preview (live database): the cell names the
// file and opens it on the file's own page, and the table's CSV export writes the WHOLE text.
//
//   TABLE=<store table id> SHA=<sha256 of the whole text> BYTES=<n> [FILE=<file id> FILE_NAME=<name>] \
//     node scripts/big-values-tails-walk.mjs
//
// Reads only (plus one file download to a temp dir). Prints a JSON verdict; exit 1 on any miss.
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://big-values-tails.localhost:3001";
const TABLE = process.env.TABLE;
const SHA = process.env.SHA;
const BYTES = Number(process.env.BYTES ?? 0);
if (!TABLE || !SHA) throw new Error("TABLE and SHA are required");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const out = { table: TABLE };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);

  // THE CELL. The copied table opens on the Sheet; the records-ui Grid draws the pointer cell.
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("table page", () => page.locator("text=Knowledge search results").first().isVisible(), 120000);
  const grid = page.getByRole("button", { name: /^Grid$/ }).first();
  if (await grid.isVisible().catch(() => false)) await grid.click();
  else {
    const tab = page.getByRole("tab", { name: /^Grid$/ }).first();
    if (await tab.isVisible().catch(() => false)) await tab.click();
  }
  const cell = page.locator("[data-whole-value-file]").first();
  const seen = await until("pointer cell", () => cell.isVisible(), 60000);
  out.pointer_cell_drawn = !!seen.v;
  if (seen.v) {
    out.cell_file = await cell.getAttribute("data-whole-value-file");
    out.cell_text = (await cell.innerText()).slice(-80);
    const link = cell.locator("a").first();
    out.cell_link = (await link.count()) ? await link.getAttribute("href") : null;
    out.cell_says_unbound = /in a file$/.test(out.cell_text.trim());
  }
  await page.screenshot({ path: join(tmpdir(), "big-values-tails-cell.png") });
  out.cell_screenshot = join(tmpdir(), "big-values-tails-cell.png");

  // THE FILE OPENS on its own page, as the person.
  // FILE=<id> opens the file's page even when the installed records-ui draws no pointer cell yet.
  const fileHref = out.cell_link ?? (process.env.FILE ? `/files/f/${process.env.FILE}` : null);
  if (fileHref) {
    const file = await context.newPage();
    const res = await file.goto(`${ORIGIN}${fileHref}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    out.file_page_status = res?.status() ?? null;
    await until("file page", async () => (await file.title()).length > 0, 60000);
    out.file_page_url = file.url();
    out.file_page_names_file = process.env.FILE_NAME
      ? await until("file name", () => file.locator(`text=${process.env.FILE_NAME}`).first().isVisible(), 60000).then((r) => !!r.v)
      : null;
    out.file_page_denied = await file.locator("text=/don't have access|not allowed|was deleted/i").first().isVisible().catch(() => false);
    await file.close();
  }

  // THE EXPORT writes the whole text.
  await page.goto(`${ORIGIN}/data-v2/${TABLE}?rail=export`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const csv = page.getByRole("button", { name: /^CSV$/ }).first();
  await until("export rail", () => csv.isVisible(), 90000);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), csv.click()]);
  const path = join(mkdtempSync(join(tmpdir(), "bvt-")), download.suggestedFilename());
  await download.saveAs(path);
  const text = readFileSync(path, "utf8");
  out.csv_bytes = Buffer.byteLength(text);
  // The whole value, found inside the CSV (a CSV cell doubles its quotes; the research text has none).
  const start = text.indexOf("Knowledge Text Results:");
  const end = text.indexOf("</result_item>\"", start);
  const cellText = start >= 0 && end > start ? text.slice(start, end + "</result_item>".length) : "";
  out.csv_cell_bytes = Buffer.byteLength(cellText);
  out.csv_cell_sha256 = createHash("sha256").update(cellText).digest("hex");
  out.csv_cell_is_whole = out.csv_cell_sha256 === SHA && (!BYTES || out.csv_cell_bytes === BYTES);
} catch (error) {
  out.error = String(error?.message ?? error);
} finally {
  await browser.close();
}
out.verdict =
  out.pointer_cell_drawn && out.cell_link && out.file_page_status === 200 && !out.file_page_denied && out.csv_cell_is_whole
    ? "GREEN"
    : "RED";
console.log(JSON.stringify(out, null, 2));
process.exit(out.verdict === "GREEN" ? 0 : 1);
