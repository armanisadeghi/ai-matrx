// LANE MENU-LABELS — headless proof on the shared preview: the schedules page header's "…"
// overflow menu at phone width (390px) shows text labels beside its icon-only items, so the
// list's copy button and the page's Alchemy button are no longer two indistinguishable icons.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/menu-labels-schedules-walk.mjs <outDir>
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.MENU_LABELS_ORIGIN ?? "http://menu-labels.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";

const browser = await chromium.launch({ headless: true });
const report = {};
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  console.log(`seat: ${await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin")}`);
  await page.goto(`${ORIGIN}/schedules`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/schedules-header-390.png` });

  const overflowTrigger = page.locator('[data-route-header-overflow]');
  await overflowTrigger.waitFor({ state: "visible", timeout: 20000 });
  await overflowTrigger.click();
  await page.waitForTimeout(500);

  const items = await page.locator('[data-route-header-overflow-item]').allInnerTexts();
  report.overflowItemTexts = items;
  await page.screenshot({ path: `${OUT}/schedules-overflow-menu-390.png` });

  report.hasCopyLabel = items.some((t) => /schedule|copy/i.test(t));
  report.hasAlchemyLabel = items.some((t) => /schedule|alchemy/i.test(t));
} finally {
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
