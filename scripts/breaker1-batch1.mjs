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
const results = {};

async function tryAddColumn(name, typeRegex) {
  await page.getByRole("button", { name: "Column", exact: false }).first().click();
  await sleep(700);
  await page.locator('#displayName').fill(name);
  if (typeRegex) {
    const combos = page.locator('[role="dialog"] button[role="combobox"]');
    await combos.nth(1).click();
    await sleep(300);
    await page.locator('[role="option"]', { hasText: typeRegex }).first().click();
    await sleep(300);
  }
  const internalKey = await page.locator('[role="dialog"] span, [role="dialog"] code').filter({hasText:/^[a-z0-9_]+$/}).allInnerTexts().catch(()=>[]);
  await page.screenshot({ path: join(SHOTS, `batch1-${name.replace(/[^a-z0-9]/gi,'_').slice(0,30)}-before.png`) });
  await page.getByRole("button", { name: "Add Column", exact: true }).click();
  await sleep(1800);
  const bodyTxt = await page.evaluate(() => document.body.innerText);
  const dialogStillOpen = await page.locator('[role="dialog"]').isVisible().catch(()=>false);
  await page.screenshot({ path: join(SHOTS, `batch1-${name.replace(/[^a-z0-9]/gi,'_').slice(0,30)}-after.png`) });
  if (dialogStillOpen) {
    // capture any error text then close
    const errTxt = await page.locator('[role="dialog"]').innerText().catch(()=>"");
    await page.keyboard.press("Escape").catch(()=>{});
    await sleep(500);
    return { internalKey, dialogStillOpen, errTxt: errTxt.slice(0,400) };
  }
  return { internalKey, dialogStillOpen };
}

try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);

  results.reserved_id = await tryAddColumn("id", null);
  results.reserved_created_at = await tryAddColumn("created_at", null);
  results.reserved_row_id = await tryAddColumn("row_id", null);
  results.long_name = await tryAddColumn("A".repeat(200), null);
  results.emoji_name = await tryAddColumn("Status 🔥🦷", null);
  results.accent_name = await tryAddColumn("Résumé Nôtes", null);

  const headers = await page.locator('[role="columnheader"], th').allInnerTexts();
  results.finalHeaders = headers;
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  console.log("ERROR:", e.message, JSON.stringify(results,null,2));
  await page.screenshot({ path: join(SHOTS, "batch1-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
