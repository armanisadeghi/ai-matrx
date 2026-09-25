// LANE ALCHEMY-BUTTON — headless proof on the shared preview that the context inspector and a
// data-v2 table page hand their page, selection and data to the Alchemy menu. Seat:
// admin@admin.com through the login form (credentials from .env.local, never printed).
// Read-only: every click is a selection or a copy.
//
// Usage: node scripts/alchemy-button-walk.mjs <outDir> [tableId]
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.ALCHEMY_ORIGIN ?? "http://alchemy.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
const TABLE = process.argv[3] ?? null;
mkdirSync(OUT, { recursive: true });
const PICKS = [
  { column: 1, label: "Castellano & Reyes, LLP" },
  { column: 2, label: "Clients" },
  { column: 3, label: "Meridian Risk Services" },
  { column: 4, label: "Contact Phone" },
];

const browser = await chromium.launch({ headless: true });
const report = { steps: [], consoleErrors: [] };
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
const page = await context.newPage();
page.on("pageerror", (e) => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));

/** Open the page's Alchemy menu and copy one AI variant; returns the clipboard text. */
async function copyVariant(label) {
  const host = page.locator("[data-page-capture]").first();
  await until("capture control", async () => (await host.count()) > 0, 120000);
  const buttons = host.locator("button");
  const names = [];
  for (let i = 0; i < (await buttons.count()); i++) names.push(await buttons.nth(i).getAttribute("aria-label"));
  report.steps.push({ controls: names });
  // The AI menu is the trigger whose name mentions AI.
  let trigger = null;
  for (let i = 0; i < (await buttons.count()); i++) {
    const n = (names[i] ?? "").toLowerCase();
    if (n.includes("ai")) trigger = buttons.nth(i);
  }
  if (!trigger) trigger = buttons.last();
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await trigger.click();
  const item = page.getByRole("menuitem", { name: new RegExp(label, "i") }).first();
  const { v: shown } = await until(`menu item ${label}`, async () => (await item.count()) > 0, 15000);
  if (!shown) {
    report.steps.push({ menu: await page.getByRole("menuitem").allInnerTexts() });
    throw new Error(`no menu item "${label}"`);
  }
  report.steps.push({ menu: await page.getByRole("menuitem").allInnerTexts() });
  await item.click();
  const { v: text } = await until("clipboard", async () => {
    const t = await page.evaluate(() => navigator.clipboard.readText());
    return t && t.length > 20 ? t : null;
  }, 30000);
  await page.keyboard.press("Escape").catch(() => undefined);
  return text;
}

try {
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");

  // ── 1. The inspector after the four picks. ──
  await page.goto(`${ORIGIN}/administration/scopes-context/context-inspector`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-context-inspector]", { timeout: 240000 });
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) await dismiss.click();
  const column = (n) => page.locator("[data-context-inspector] .min-w-\\[560px\\] > div").nth(n - 1);
  const row = (n, label) => column(n).locator("button[aria-pressed]", { hasText: label }).first();
  for (const p of PICKS) {
    await until(`${p.label} row`, async () => (await row(p.column, p.label).count()) > 0, 120000);
    await row(p.column, p.label).click();
    await page.waitForTimeout(500);
  }
  await until("compare", async () =>
    (await page.locator("[data-compare-side]").count()) >= 2 || (await page.locator("text=Comparison unavailable").count()) > 0, 180000);
  await page.screenshot({ path: `${OUT}/1-inspector-after-picks.png`, fullPage: true });
  report.inspectorUrl = page.url().replace(ORIGIN, "");
  const inspector = await copyVariant("Everything on this page");
  writeFileSync(`${OUT}/inspector-capture.md`,
    `# Context inspector — Alchemy capture (lane ALCHEMY-BUTTON, 2026-09-25)\n\n` +
    `Copied headless as admin@admin.com from ${report.inspectorUrl} after picking ` +
    `${PICKS.map((p) => p.label).join(" → ")}, with the page's Alchemy menu → "Everything on this page".\n\n` +
    "````text\n" + inspector + "\n````\n");
  report.inspectorChars = inspector?.length ?? 0;

  // ── 2. A data-v2 table page (read-only; the quick copy reads no records). ──
  if (TABLE) {
    await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await until("table page", async () => (await page.locator("[data-page-capture]").count()) > 0, 240000);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/2-table-page.png`, fullPage: false });
    report.tableUrl = page.url().replace(ORIGIN, "");
    const table = await copyVariant("Everything on this page");
    writeFileSync(`${OUT}/table-capture.md`,
      `# Data table page — Alchemy capture (lane ALCHEMY-BUTTON, 2026-09-25)\n\n` +
      `Copied headless as admin@admin.com from ${report.tableUrl} with the page's Alchemy menu → ` +
      `"Everything on this page" (the quick copy: it reads no records; "Everything, with records" would).\n\n` +
      "````text\n" + table + "\n````\n");
    report.tableChars = table?.length ?? 0;
  }
} catch (e) {
  report.error = String(e).slice(0, 500);
  await page.screenshot({ path: `${OUT}/error.png`, fullPage: false }).catch(() => undefined);
} finally {
  writeFileSync(`${OUT}/walk-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
