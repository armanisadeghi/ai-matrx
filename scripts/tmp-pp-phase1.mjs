import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(AI_ADMIN_USERNAME|AI_ADMIN_PASSWORD)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const BASE = "https://www.aimatrx.com";
const CLASS_NAME = "Agent Test Chemistry " + Date.now();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(`${BASE}/login`, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.fill('input[type="email"]', process.env.AI_ADMIN_USERNAME);
  await page.fill('input[type="password"]', process.env.AI_ADMIN_PASSWORD);
  await page.evaluate(() => document.querySelector("form")?.requestSubmit());
  await page.waitForFunction(() => !document.querySelector('input[type="email"]'), null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log("logged in as admin, url:", page.url());

  await page.goto(`${BASE}/education/classes`, { timeout: 60000 });
  await page.waitForTimeout(4000);
  // Pick admin's Workspace if the org gate shows.
  const chooseOrg = page.getByRole("button", { name: /Choose organization/i }).first();
  if (await chooseOrg.count()) {
    await chooseOrg.click();
    await page.waitForTimeout(1500);
    const opt = page.locator("[data-radix-popper-content-wrapper] button, [role=dialog] button").filter({ hasText: /Workspace/i }).first();
    if (await opt.count()) {
      await opt.click();
      await page.waitForTimeout(2000);
    }
  }
  await page.waitForTimeout(1500);

  const newClassBtn = page.getByRole("button", { name: "New class" }).first();
  await newClassBtn.click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.fill("#class-name", CLASS_NAME);
  await page.getByRole("button", { name: "Create class" }).click();
  await page.waitForTimeout(4000);
  console.log("after create, url:", page.url());

  // Land on class detail — open Invite students.
  if (!/\/education\/classes\//.test(page.url())) {
    // Might still be on the list; click the newly created row.
    const row = page.locator("text=" + CLASS_NAME).first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(3000);
    }
  }
  console.log("class detail url:", page.url());

  const inviteBtn = page.getByRole("button", { name: "Invite students" }).first();
  await inviteBtn.click({ timeout: 15000 });
  await page.waitForTimeout(2000);

  const createCodeBtn = page.getByRole("button", { name: "Create a join code" }).first();
  if (await createCodeBtn.count()) {
    await createCodeBtn.click();
    await page.waitForTimeout(2000);
  }
  const codeSpan = page.locator("span.font-mono").first();
  await codeSpan.waitFor({ timeout: 10000 });
  const code = (await codeSpan.textContent())?.trim();
  console.log("JOIN_CODE:", code);
  console.log("CLASS_URL:", page.url());
  console.log("CLASS_NAME:", CLASS_NAME);
} catch (e) {
  console.error("ERROR:", e.message);
  await page.screenshot({ path: "/tmp/pp-edu/scripts/phase1-error.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
