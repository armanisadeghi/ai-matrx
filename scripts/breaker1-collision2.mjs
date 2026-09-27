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
page.on("console", (m) => { if (m.type()==='error'||m.type()==='warning') consoleMsgs.push(`${m.type()}: ${m.text().slice(0,300)}`); });
const netCalls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("field_")) { let body=null; try{body=await r.text();}catch{} netCalls.push({ url: u.replace(/\?.*$/, ""), status: r.status(), body: body?.slice(0,400) }); }
});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  const toolbar = page.locator('[data-table-toolbar]').first();
  await toolbar.locator('button').nth(17).click({force:true});
  await sleep(1000);
  // rename Discount Percent -> Fee Percent
  const nameInput = page.locator('[role=dialog] input[value="Discount Percent"]').first();
  await nameInput.fill("Fee Percent");
  await sleep(400);
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await sleep(2000);
  await page.screenshot({ path: join(SHOTS, "renamed-discount-to-fee.png"), fullPage: true });
  console.log("RENAME NET:", JSON.stringify(netCalls, null, 2));
  netCalls.length = 0;

  // Now add a new column named "Discount Percent" (Percent type) — collision with leftover key discount_percent
  await page.getByRole("button", { name: "Column", exact: false }).first().click();
  await sleep(800);
  await page.locator('#displayName').fill("Discount Percent");
  const combos = page.locator('[role="dialog"] button[role="combobox"]');
  await combos.nth(1).click();
  await sleep(400);
  await page.locator('[role="option"]', { hasText: /^Percent/ }).first().click();
  await sleep(400);
  await page.screenshot({ path: join(SHOTS, "collision-before-add.png"), fullPage: true });
  await page.getByRole("button", { name: "Add Column", exact: true }).click();
  await sleep(2500);
  await page.screenshot({ path: join(SHOTS, "collision-after-add.png"), fullPage: true });
  const bodyTxt = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log("BODY:\n", bodyTxt);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "collision2-error.png") }).catch(()=>{});
} finally {
  console.log("CONSOLE:\n", consoleMsgs.join("\n"));
  console.log("NET2:", JSON.stringify(netCalls, null, 2));
  await browser.close();
}
