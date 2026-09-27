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

async function openAddColumn(page) {
  await page.getByRole("button", { name: "Column", exact: false }).first().click();
  await sleep(800);
}

async function pickShowsAs(page, regex) {
  const combos = page.locator('[role="dialog"] button[role="combobox"]');
  await combos.nth(1).click();
  await sleep(400);
  const opt = page.locator('[role="option"]', { hasText: regex }).first();
  await opt.click();
  await sleep(300);
}

async function addColumn(page, name, showsAsRegex) {
  await openAddColumn(page);
  await page.locator('#displayName').fill(name);
  await pickShowsAs(page, showsAsRegex);
  await page.screenshot({ path: join(SHOTS, `col-${name.replace(/[^a-z0-9]/gi,'')}-before-add.png`) });
  await page.getByRole("button", { name: "Add Column", exact: true }).click();
  await sleep(1500);
}

try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);

  await addColumn(page, "Patient Name", /^Text[^\n]*Plain single-line/);
  await addColumn(page, "Status", /^Choice/);
  await addColumn(page, "Procedure Category", /^Choice/);
  await addColumn(page, "Appointment", /^Date & time/);
  await addColumn(page, "Completion Percent", /^Percent/);
  await addColumn(page, "Discount Percent", /^Percent/);
  await addColumn(page, "Notes", /^Long text/);
  await addColumn(page, "Preferred Time", /^Time/);

  await sleep(1500);
  await page.screenshot({ path: join(SHOTS, "columns-added.png"), fullPage: true });
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log(txt);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "recon7-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
