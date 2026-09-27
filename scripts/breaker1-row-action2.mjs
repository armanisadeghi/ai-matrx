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
  await page.mouse.wheel(2000, 0);
  await sleep(500);
  await page.screenshot({ path: join(SHOTS, "scrolled-right.png"), fullPage: true });
  // find the lightning icon button near "Actions" header
  const header = page.locator('[role="columnheader"], th').filter({ hasText: "Actions" }).first();
  const box = await header.boundingBox();
  console.log("actions header box", box);
  if (box) {
    await page.mouse.click(box.x + box.width - 15, box.y + box.height/2);
    await sleep(1000);
    await page.screenshot({ path: join(SHOTS, "actions-lightning-click.png"), fullPage: true });
  }
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "row-action2-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
