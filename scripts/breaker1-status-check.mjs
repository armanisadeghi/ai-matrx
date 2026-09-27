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
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3000);
  const headers = await page.locator('[role="columnheader"], th').allInnerTexts().catch(()=>[]);
  console.log("headers via role:", headers);
  const bodyTxt = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log(bodyTxt);
  // Click Status header to open menu
  const statusHeader = page.locator("text=Status").first();
  console.log("status header visible:", await statusHeader.isVisible().catch(()=>false));
  if (await statusHeader.isVisible().catch(()=>false)) {
    await statusHeader.click();
    await sleep(800);
    await page.screenshot({ path: join(SHOTS, "status-header-click.png"), fullPage: true });
  }
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "statuscheck-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
