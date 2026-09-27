import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "https://www.aimatrx.com";
const SHOTS = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/breaker1/shots";
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const TABLE = "31173dbe-04f5-4973-be03-2a41f0737142";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  const n = await page.locator("[data-records-add-column]").count();
  console.log("add-column count:", n);
  // dump all data- attributes near header
  const headerHtml = await page.evaluate(() => {
    const header = document.querySelector('[role="row"], thead, .grid-header') || document.body;
    return document.body.innerHTML.length;
  });
  console.log("body html length", headerHtml);
  // Try clicking Sheet
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(e=>console.log('sheet click err', e.message));
  await sleep(2000);
  await page.screenshot({ path: join(SHOTS, "sheet-view.png"), fullPage: true });
  const n2 = await page.locator("[data-records-add-column]").count();
  console.log("sheet add-column count:", n2);
  // grep for any element with data-records in attribute
  const attrs = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("*"));
    const set = new Set();
    for (const el of els) {
      for (const a of el.attributes) {
        if (a.name.startsWith("data-records") || a.name.startsWith("data-table")) set.add(a.name);
      }
    }
    return [...set];
  });
  console.log("data-records/table attrs on page:", attrs);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "recon4-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
