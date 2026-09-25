/**
 * LANE FE-TAILS — headless proof on the shared preview: the console error census is ZERO on
 * (1) admin's designated table opening as the Sheet (Rincon Plumbing — Service Calls), where
 * GRID-PORT's hand-order probe used to log a 409; (2) the organization's Tables page and (3) the
 * hub's "All my organizations" list, both now drawing records-ui's WhereItLives.
 *
 *   FET_ORIGIN=http://fe-tails.localhost:3001 FET_EMAIL=… FET_PASSWORD=… node scripts/campaign-tests/fetails_console_census.mjs
 *
 * Read-only: signs in through the login form, opens pages, presses a Lives-in chip (opens a
 * popover; nothing is moved). Credentials are never printed.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.FET_ORIGIN ?? "http://fe-tails.localhost:3001";
const OUT = process.env.FET_SHOTS ?? "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/shots/fe-tails";
const EMAIL = process.env.FET_EMAIL ?? "";
const PASSWORD = process.env.FET_PASSWORD ?? "";
if (!EMAIL || !PASSWORD) {
  console.error("The seat's sign-in is not in the environment (never printed).");
  process.exit(2);
}
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const DESIGNATED = "dbc7cd48-7b46-4402-ac9d-e459a95f4598"; // Rincon Plumbing — Service Calls (Sheet)
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const result = {};
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, "admin seat");
  if (who !== EMAIL) throw new Error("the app says someone else is signed in");
  result.who = "admin seat confirmed by /api/whoami";

  let census = null;
  page.on("console", (m) => {
    if (census && m.type() === "error") census.consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => census?.pageErrors.push(String(e.message).slice(0, 300)));
  page.on("response", (r) => {
    if (!census) return;
    const url = r.url();
    if (url.includes("/rest/v1/rpc/")) census.doors.push(`${r.status()} ${url.split("/rest/v1/rpc/")[1].split("?")[0]}`);
    if (r.status() >= 400) census.badResponses.push(`${r.status()} ${url.slice(0, 200)}`);
  });

  const walk = async (name, url, ready, extra) => {
    census = { consoleErrors: [], pageErrors: [], badResponses: [], doors: [] };
    await page.goto(`${ORIGIN}${url}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForSelector(ready, { timeout: 240000 }).catch(() => {});
    await sleep(8000);
    const facts = extra ? await extra() : {};
    await page.screenshot({ path: `${OUT}/${name}-1440.png` });
    const c = census;
    census = null;
    const errors = c.consoleErrors.length + c.pageErrors.length + c.badResponses.length;
    if (errors > 0) failed = true;
    result[name] = {
      url,
      errorCensus: errors,
      consoleErrors: c.consoleErrors,
      pageErrors: c.pageErrors,
      badResponses: c.badResponses,
      viewKeysRead: c.doors.filter((d) => d.endsWith("view_keys")),
      viewOrderReads: c.doors.filter((d) => d.includes("read_records_in_view_order")),
      ...facts,
    };
  };

  await walk("sheet-designated", `/data-v2/${DESIGNATED}`, "[data-sheet-layout]", async () => ({
    sheet: Boolean(await page.$("[data-sheet-layout]")),
    rows: await page.locator("[data-sheet-layout] tbody tr").count(),
    chip: await page.locator("[data-where-it-lives]").allTextContents(),
  }));
  await walk("org-tables", `/organizations/${ORG}/tables`, "[data-where-it-lives]", async () => {
    const chips = await page.locator("[data-where-it-lives]").allTextContents();
    let panel = null;
    if (chips.length) {
      await page.locator("[data-where-it-lives]").first().click();
      await sleep(3000);
      panel = await page.locator("[data-where-it-lives-panel]").first().textContent().catch(() => null);
      await page.keyboard.press("Escape");
    }
    return { chips: chips.slice(0, 6), chipCount: chips.length, panelOpened: panel ? panel.slice(0, 160) : null };
  });
  await walk("hub-all-organizations", `/data-v2?org=${ORG}&scope=all`, "[data-hub-all-organizations]", async () => ({
    list: Boolean(await page.$("[data-hub-all-organizations]")),
    chips: (await page.locator("[data-hub-all-organizations] [data-where-it-lives]").allTextContents()).slice(0, 6),
    chipCount: await page.locator("[data-hub-all-organizations] [data-where-it-lives]").count(),
  }));
  await context.close();
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/census.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(failed ? 1 : 0);
