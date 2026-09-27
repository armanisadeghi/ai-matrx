import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, sleep } from "./lib/seat-browser.mjs";
const ORIGIN = "https://www.aimatrx.com";
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
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  const toolbar = page.locator('[data-table-toolbar]').first();
  await toolbar.locator('button').nth(17).click({force:true});
  await sleep(1000);
  const captions = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]');
    return Array.from(dialog.querySelectorAll('div')).filter(d=>d.children.length===0 && /appointment_status/.test(d.textContent||'')).map(d=>JSON.stringify(d.textContent));
  });
  console.log(captions);
} catch (e) { console.log("ERR", e.message); }
finally { await browser.close(); }
