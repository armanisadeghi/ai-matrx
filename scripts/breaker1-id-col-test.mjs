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
const consoleMsgs = [];
page.on("console", (m) => { if (m.type()==='error') consoleMsgs.push(m.text().slice(0,300)); });
const netCalls = [];
page.on("response", async (r) => { const u=r.url(); if (u.includes("record_update")||u.includes("read_record")) { let b=null; try{b=await r.text();}catch{} netCalls.push({url:u.replace(/\?.*$/,""), status:r.status(), body:b?.slice(0,300)}); }});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2500);
  const headerLoc = page.locator('[role="columnheader"], th').filter({ hasText: /^id$/ }).first();
  const box = await headerLoc.boundingBox();
  console.log("id header box:", box);
  if (box) {
    await page.mouse.click(box.x + box.width/2, box.y + box.height + 20);
    await sleep(400);
    await page.keyboard.press("Enter");
    await sleep(400);
    await page.keyboard.type("FAKE-ID-VALUE-123");
    await sleep(400);
    await page.keyboard.press("Enter");
    await sleep(1500);
  }
  await page.screenshot({ path: join(SHOTS, "id-col-after-type.png"), fullPage: true });
  // reload and check row count / integrity, and whether row's real record id still resolves (click Get reference / history icon)
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2500);
  const rowsText = await page.locator("text=/of \\d+ rows/").first().innerText().catch(()=>"?");
  console.log("rows after:", rowsText);
  console.log("CONSOLE ERR:", consoleMsgs.join("\n"));
  console.log("NET:", JSON.stringify(netCalls.slice(-5), null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "idcoltest-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
