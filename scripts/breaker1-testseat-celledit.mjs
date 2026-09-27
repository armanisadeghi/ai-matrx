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
const netCalls = [];
page.on("response", async (r) => { const u=r.url(); if (u.includes("record_update")) { let b=null; try{b=await r.text();}catch{} netCalls.push({url:u.replace(/\?.*$/,""), status:r.status(), body:b?.slice(0,200)}); }});
try {
  await signIn(page, ORIGIN, env.AI_MEMBER_USERNAME, env.AI_MEMBER_PASSWORD, "test");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2500);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  const header = page.locator('[role="columnheader"], th').filter({ hasText: "Title" }).first();
  const box = await header.boundingBox();
  await page.mouse.click(box.x+box.width/2, box.y+box.height+20);
  await page.keyboard.press("Enter");
  await sleep(300);
  await page.keyboard.type(" [edited by editor seat]");
  await page.keyboard.press("Enter");
  await sleep(1200);
  console.log("NET:", JSON.stringify(netCalls, null, 2));
  await page.screenshot({ path: join(SHOTS, "testseat-celledit.png") });
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  await browser.close();
}
