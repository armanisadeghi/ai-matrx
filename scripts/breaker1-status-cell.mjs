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
page.on("console", (m) => { if (m.type()==='error'||m.type()==='warning') consoleMsgs.push(`${m.type()}: ${m.text().slice(0,200)}`); });
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  await page.getByRole("button", { name: "Add the first row", exact: false }).click().catch(async()=>{
    await page.getByRole("button", { name: "Row", exact: false }).first().click();
  });
  await sleep(2000);
  await page.screenshot({ path: join(SHOTS, "row-added.png"), fullPage: true });
  // Find the Status column cell in the first row and click it
  const statusColIdx = (await page.locator('[role="columnheader"], th').allInnerTexts()).findIndex(t => t.includes("Status"));
  console.log("status col idx", statusColIdx);
  // click on a cell under Status - try locating by row cell position via bounding boxes
  const headerLoc = page.locator('[role="columnheader"], th').filter({ hasText: "Status" }).first();
  const box = await headerLoc.boundingBox();
  console.log("status header box", box);
  if (box) {
    await page.mouse.click(box.x + box.width/2, box.y + box.height + 20);
    await sleep(600);
    await page.screenshot({ path: join(SHOTS, "status-cell-clicked.png"), fullPage: true });
    await page.keyboard.type("Scheduled");
    await sleep(800);
    await page.screenshot({ path: join(SHOTS, "status-cell-typed.png"), fullPage: true });
    await page.keyboard.press("Enter");
    await sleep(1500);
    await page.screenshot({ path: join(SHOTS, "status-cell-after-enter.png"), fullPage: true });
  }
  console.log("CONSOLE:\n", consoleMsgs.join("\n"));
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "statuscell-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
