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
page.on("response", async (r) => { const u=r.url(); if (u.includes("field_declare")||u.includes("field_update")||u.includes("field_delete")||u.includes("field_archive")) { let b=null; try{b=await r.text();}catch{} netCalls.push({url:u.replace(/\?.*$/,""), status:r.status(), body:b?.slice(0,300)}); }});
try {
  await signIn(page, ORIGIN, env.AI_MEMBER_USERNAME, env.AI_MEMBER_PASSWORD, "test");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2500);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  // As Editor, try adding a real new column to prove actual write capability (not just UI render)
  await page.getByRole("button", { name: "Column", exact: false }).first().click();
  await sleep(700);
  await page.locator('#displayName').fill("Editor Seat Test Column");
  await sleep(300);
  await page.getByRole("button", { name: "Add Column", exact: true }).click();
  await sleep(2000);
  await page.screenshot({ path: join(SHOTS, "testseat-added-column.png"), fullPage: true });
  console.log("NET:", JSON.stringify(netCalls, null, 2));
  const headers = await page.locator('[role="columnheader"], th').allInnerTexts();
  console.log("has new column:", headers.some(h=>h.includes("Editor Seat Test Column")));
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "testseat-write-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
