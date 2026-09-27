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
  await page.goto(`${ORIGIN}/data-v2/${TABLE}?view=sheet&sort=completion_percent.asc`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2500);
  const header = page.locator('[role="columnheader"], th').filter({ hasText: "Completion Percent" }).first();
  await header.click();
  await sleep(700);
  await page.locator('text="0"').first().click({force:true}).catch(()=>{});
  await sleep(1000);
  console.log("URL after filter 0:", page.url());
  await page.keyboard.press("Escape");
  await sleep(500);
  const rowsTxt = await page.locator("text=/of \\d+ rows/").first().innerText().catch(()=>"?");
  console.log("rows after filter:", rowsTxt);
  await page.screenshot({ path: join(SHOTS, "filtered-state.png"), fullPage: true });
  // now go back / forward
  const filteredUrl = page.url();
  await page.goto(`${ORIGIN}/data-v2/${TABLE}?view=sheet`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await page.goBack();
  await sleep(1500);
  console.log("URL after goBack:", page.url());
  const rowsTxt2 = await page.locator("text=/of \\d+ rows/").first().innerText().catch(()=>"?");
  console.log("rows after goBack:", rowsTxt2);
  await page.screenshot({ path: join(SHOTS, "after-goback.png"), fullPage: true });
  // reload mid such state
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
  const rowsTxt3 = await page.locator("text=/of \\d+ rows/").first().innerText().catch(()=>"?");
  console.log("rows after reload:", rowsTxt3, "url:", page.url());
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "filter2-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
