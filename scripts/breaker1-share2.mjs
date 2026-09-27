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
  await sleep(2500);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await sleep(1000);
  await page.getByText("test@test.com", { exact: false }).first().click();
  await sleep(500);
  await page.screenshot({ path: join(SHOTS, "share-test-selected.png"), fullPage: true });
  // change permission level to Editor
  const permCombo = page.locator('[role=dialog] button[role="combobox"]', { hasText: "Viewer" }).first();
  await permCombo.click();
  await sleep(400);
  await page.screenshot({ path: join(SHOTS, "share-perm-options.png"), fullPage: true });
  const opts = await page.locator('[role="option"]').allInnerTexts();
  console.log("perm options:", opts.filter(Boolean));
  await page.locator('[role="option"]', { hasText: /Editor|Can edit/ }).first().click();
  await sleep(400);
  await page.getByRole("button", { name: "Share with User", exact: true }).click();
  await sleep(1500);
  await page.screenshot({ path: join(SHOTS, "share-done.png"), fullPage: true });
  const txt = await page.evaluate(() => document.body.innerText.slice(-1000));
  console.log(txt);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "share2-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
