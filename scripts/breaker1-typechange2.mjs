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
  const toolbar = page.locator('[data-table-toolbar]').first();
  await toolbar.locator('button').nth(17).click({force:true});
  await sleep(1000);
  const result = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]');
    const allDivs = Array.from(dialog.querySelectorAll('div'));
    const caption = allDivs.find(d => d.children.length===0 && (d.textContent||'').trim() === '#100 • appointment_status');
    if (!caption) return { ok:false, reason:'no caption' };
    // walk up to find ancestor containing exactly 2+ comboboxes AND the caption
    let el = caption;
    for (let i=0;i<8;i++){
      el = el.parentElement;
      if (!el) break;
      const combos = el.querySelectorAll('button[role=combobox]');
      if (combos.length>=2 && combos.length<=6) {
        // mark it for playwright to find via a unique attribute
        el.setAttribute('data-breaker-card','appointment_status');
        return { ok:true, depth:i, combos: combos.length };
      }
    }
    return { ok:false, reason:'not found within 8 levels' };
  });
  console.log("mark result:", result);
  const card = page.locator('[data-breaker-card="appointment_status"]');
  const combos = card.locator('button[role=combobox]');
  console.log("combos found:", await combos.count());
  for (let i=0;i<await combos.count();i++){
    console.log(i, await combos.nth(i).innerText());
  }
  await combos.nth(1).click();
  await sleep(400);
  await page.screenshot({ path: join(SHOTS, "tc2-showsas-open.png"), fullPage: true });
  await page.locator('[role="option"]', { hasText: /^Text[^\n]*Plain single-line/ }).first().click();
  await sleep(500);
  await page.screenshot({ path: join(SHOTS, "tc2-selected.png"), fullPage: true });
  const saveBtn = page.getByRole("button", { name: "Save Changes", exact: true });
  console.log("save enabled:", await saveBtn.isEnabled().catch(()=>false));
  await saveBtn.click();
  await sleep(2500);
  await page.screenshot({ path: join(SHOTS, "tc2-after-save.png"), fullPage: true });
  const headers = await page.locator('[role="columnheader"], th').allInnerTexts();
  console.log("headers:", headers);
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "tc2-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
