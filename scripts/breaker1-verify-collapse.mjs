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
const netCalls = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("response", async (r) => { const u=r.url(); if (u.includes("read_records_by_ids")||u.includes("read_record")||u.includes("views")||u.includes("grid_layout")) { let b=null; try{b=await r.text();}catch{} netCalls.push({url:u.replace(/\?.*$/,""), status:r.status(), body:b?.slice(0,600)}); }});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(2000);
  await page.screenshot({ path: join(SHOTS, "verify-collapse-fresh-load.png"), fullPage: true });
  const headers = await page.locator('[role="columnheader"], th').allInnerTexts();
  console.log("HEADERS after fresh reload:", headers);
  // open configure table fields
  const toolbar = page.locator('[data-table-toolbar]').first();
  await toolbar.locator('button').nth(17).click({force:true});
  await sleep(1200);
  const txt = await page.evaluate(() => document.body.innerText);
  const idx = txt.indexOf("Fields & Order");
  console.log(txt.slice(idx, idx+3000));
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "verify-collapse-error.png") }).catch(()=>{});
} finally {
  console.log("NET:", JSON.stringify(netCalls, null, 2));
  await browser.close();
}
