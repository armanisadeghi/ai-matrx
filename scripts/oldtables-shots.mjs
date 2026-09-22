/**
 * OLD-TABLES-1 — the headless proof, on a real older dataset, from the admin seat.
 * Rincon Plumbing & Drain's dispatch board in admin's Workspace: Service Calls whose
 * `customer` column is the new `relation` format, pointing at the Customers table.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const ORIGIN = "http://127.0.0.1:3051";
const CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
mkdirSync(OUT, { recursive: true });

const errors = [];
const bad = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

  const nonce = randomBytes(16).toString("hex");
  writeFileSync("/Users/armanisadeghi/code/matrx-frontend/.dev-login-nonce.127.0.0.1", `${nonce}\n`);
  const dest = `/data/${CALLS}?ps=50`;
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(dest)}`, {
    waitUntil: "domcontentloaded", timeout: 180000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  console.log("[shots] seat:", JSON.stringify(who));
  if (!who?.email) throw new Error("no identity — the walk would prove nothing");

  await page.waitForLoadState("networkidle", { timeout: 180000 }).catch(() => {});
  // A skeleton satisfies `tr`. Wait for a real work order to be on screen.
  await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 180000 });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${OUT}/oldtables-1-service-calls-grid.png`, fullPage: false });

  const text = await page.evaluate(() => document.body.innerText);
  const uuids = (text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []);
  console.log("[shots] full uuids visible on the grid:", uuids.length, JSON.stringify(uuids.slice(0, 5)));
  console.log("[shots] shows 'Record ' identifier chips:", (text.match(/Record [0-9a-f]{8}/g) || []).length);
  console.log("[shots] console errors:", errors.length, JSON.stringify(errors.slice(0, 3)));
  console.log("[shots] responses >= 400:", bad.length, JSON.stringify(bad.slice(0, 3)));

  // The column profile / header menu, where the filter checklist lives.
  const header = page.locator('th:has-text("Customer"), [role="columnheader"]:has-text("Customer")').first();
  if (await header.count()) {
    await header.hover().catch(() => {});
    await page.screenshot({ path: `${OUT}/oldtables-2-customer-column.png` });
  }

  writeFileSync(`${OUT}/oldtables-walk.json`, JSON.stringify({
    seat: who.email, table: CALLS, fullUuidsVisible: uuids.length,
    recordChips: (text.match(/Record [0-9a-f]{8}/g) || []).length,
    consoleErrors: errors, responsesOver400: bad,
  }, null, 2));

  await browser.close();
}
main().catch((e) => { console.error("[shots] FAILED:", e.message); process.exit(1); });
