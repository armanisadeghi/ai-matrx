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
page.on("response", async (r)=>{ const u=r.url(); if(u.includes("row_action")||u.includes("record_update")) { let b=null; try{b=await r.text();}catch{} netCalls.push({url:u.replace(/\?.*$/,""), status:r.status(), body:b?.slice(0,300)});}});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2500);
  const btn = page.getByRole("button", { name: "Mark Confirmed" }).first();
  console.log("visible:", await btn.isVisible().catch(()=>false));
  await btn.click();
  await sleep(1500);
  await page.screenshot({ path: join(SHOTS, "rowaction-clicked.png"), fullPage: true });
  console.log("NET:", JSON.stringify(netCalls, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "rowaction-run2-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
