// LANE PARITY-NIGHTLY — headless proof on the shared preview: the admin scopes-context landing
// shows "Last parity: <date>, <n> defects" read from the guard's own scheduler row, with the link
// to its rows; and Scheduled system jobs lists the guard switched off with its nightly cadence.
// Read-only: nothing is clicked but links.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/parity-nightly-walk.mjs <outDir>
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.PARITY_ORIGIN ?? "http://parity-nightly.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { origin: ORIGIN, consoleErrors: [] };
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
page.on("pageerror", (e) => report.consoleErrors.push(String(e).slice(0, 300)));
try {
  for (let attempt = 1; ; attempt++) {
    try {
      report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
    }
  }
  await page.goto(`${ORIGIN}/administration/scopes-context`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const line = page.getByText(/Last parity:/).first();
  await line.waitFor({ timeout: 240000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Reading the last context parity run"), null, { timeout: 60000 });
  report.line = (await line.locator("xpath=ancestor::p[1]").innerText()).trim();
  report.rowsLink = await page.getByRole("link", { name: "See the rows" }).getAttribute("href").catch(() => null);
  report.switchLink = await page.getByRole("link", { name: /turn it on/ }).getAttribute("href").catch(() => null);
  await page.screenshot({ path: `${OUT}/parity-01-scopes-context-landing.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${OUT}/parity-02-scopes-context-390.png` });
  report.horizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.setViewportSize({ width: 1440, height: 950 });

  await page.goto(`${ORIGIN}/administration/automation/scheduling/system-jobs`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const job = page.getByText("Context parity guard (nightly)").first();
  await job.waitFor({ timeout: 240000 });
  await job.scrollIntoViewIfNeeded();
  report.jobRow = (await job.locator("xpath=ancestor::tr[1]").innerText().catch(async () => await job.innerText())).replace(/\s+/g, " ").trim();
  await page.screenshot({ path: `${OUT}/parity-03-system-jobs.png` });
} catch (error) {
  report.error = String(error).slice(0, 600);
} finally {
  writeFileSync(`${OUT}/parity-nightly-walk.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
