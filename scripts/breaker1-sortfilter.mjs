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
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  // Sort by Completion Percent
  await page.getByRole("button", { name: /Title/, exact: false }).first().click(); // opens sort dropdown maybe
  await sleep(500);
  await page.screenshot({ path: join(SHOTS, "sort-dropdown.png"), fullPage: true });
  console.log("URL after sort click:", page.url());
  // try clicking a Completion Percent header cell to sort by it directly
  const header = page.locator('[role="columnheader"], th').filter({ hasText: "Completion Percent" }).first();
  await header.click();
  await sleep(1000);
  console.log("URL after header click sort:", page.url());
  await page.screenshot({ path: join(SHOTS, "sorted-by-completion.png"), fullPage: true });
  // apply a filter
  const filterIcon = header.locator('svg, button').last();
  await filterIcon.click({force:true}).catch(async ()=>{ await page.getByRole("button", {name:"Filter"}).click().catch(()=>{}); });
  await sleep(800);
  await page.screenshot({ path: join(SHOTS, "filter-opened.png"), fullPage: true });
  console.log("URL after filter open:", page.url());
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "sortfilter-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
