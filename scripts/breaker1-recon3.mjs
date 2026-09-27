import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, setOrganization, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "https://www.aimatrx.com";
const SHOTS = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/breaker1/shots";
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await setOrganization(page, "Harbor Dental Group");
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  await page.getByRole("button", { name: /New table/i }).first().click();
  await sleep(1000);
  await page.getByPlaceholder("Table name").fill("Breaker Disposable Table");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await sleep(4000);
  console.log("URL after create:", page.url());
  await page.screenshot({ path: join(SHOTS, "after-create.png"), fullPage: true });
  // try open add column
  const addCol = page.locator("[data-records-add-column]").first();
  console.log("add col visible:", await addCol.isVisible().catch(()=>false));
  await addCol.click({timeout: 15000}).catch(e=>console.log("click err", e.message));
  await sleep(1200);
  await page.screenshot({ path: join(SHOTS, "add-column-dialog.png"), fullPage: true });
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("ADD COL TEXT:\n", txt);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "recon3-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
