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
page.on("console", (m) => { if (m.type()==='error'||m.type()==='warning') consoleMsgs.push(`${m.type()}: ${m.text().slice(0,250)}`); });
const netCalls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("field_update") || u.includes("record_write") || u.includes("record_update")) {
    let body=null; try{body=await r.text();}catch{}
    netCalls.push({ url: u.replace(/\?.*$/, ""), status: r.status(), body: body?.slice(0,300) });
  }
});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  // scroll right to see Procedure Category column, click its cell in row 1
  const cell = page.locator('[role="row"]').nth(1).locator('[role="gridcell"], td').filter({ hasText: "" });
  // Fallback: locate by header position
  const headerCells = page.locator('[role="columnheader"], th');
  const count = await headerCells.count();
  let idx = -1;
  for (let i=0;i<count;i++){ const t = await headerCells.nth(i).innerText(); if (t.includes("Procedure Category")) { idx = i; break; } }
  console.log("Procedure Category header idx", idx);
  const hbox = await headerCells.nth(idx).boundingBox();
  console.log("header box", hbox);
  // click the cell below it in the first data row (approx y = header bottom + 25)
  await page.mouse.click(hbox.x + hbox.width/2, hbox.y + hbox.height + 20);
  await sleep(500);
  await page.screenshot({ path: join(SHOTS, "choice-cell-click1.png"), fullPage: true });
  await page.keyboard.press("Enter"); // try to open editor
  await sleep(500);
  await page.screenshot({ path: join(SHOTS, "choice-cell-editor.png"), fullPage: true });
  await page.keyboard.type("Cleaning");
  await sleep(600);
  await page.screenshot({ path: join(SHOTS, "choice-cell-typed.png"), fullPage: true });
  await page.keyboard.press("Enter");
  await sleep(1500);
  await page.screenshot({ path: join(SHOTS, "choice-cell-after.png"), fullPage: true });
  console.log("CONSOLE:\n", consoleMsgs.join("\n"));
  console.log("NET:", JSON.stringify(netCalls, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "choicecell-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
