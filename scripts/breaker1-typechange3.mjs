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
  const label = page.locator('[role=dialog] >> text=/appointment_status/').first();
  await label.scrollIntoViewIfNeeded();
  await sleep(600);
  const result = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]');
    const all = Array.from(dialog.querySelectorAll('*'));
    const matches = all.filter(el => (el.textContent||'').includes('appointment_status'));
    // leaf-most: an element whose textContent includes it but none of its children's textContent do (or has no element children)
    let caption = matches.find(el => !Array.from(el.children).some(c => (c.textContent||'').includes('appointment_status')));
    if (!caption) caption = matches[matches.length-1];
    if (!caption) return { ok:false, total: matches.length };
    let el = caption;
    for (let i=0;i<10;i++){
      el = el.parentElement;
      if (!el) break;
      const combos = el.querySelectorAll('button[role=combobox]');
      if (combos.length>=2 && combos.length<=6) { el.setAttribute('data-breaker-card','appointment_status'); return { ok:true, combos: combos.length, i }; }
    }
    return { ok:false, total: matches.length };
  });
  console.log("result:", result);
  const card = page.locator('[data-breaker-card="appointment_status"]');
  const combos = card.locator('button[role=combobox]');
  console.log("combos:", await combos.count());
  await combos.nth(1).click();
  await sleep(400);
  await page.screenshot({ path: join(SHOTS, "tc3-open.png"), fullPage: true });
  await page.locator('[role="option"]', { hasText: /^Text[^\n]*Plain single-line/ }).first().click();
  await sleep(500);
  const saveBtn = page.getByRole("button", { name: "Save Changes", exact: true });
  console.log("save enabled:", await saveBtn.isEnabled().catch(()=>false));
  await saveBtn.click();
  await sleep(2500);
  await page.screenshot({ path: join(SHOTS, "tc3-after-save.png"), fullPage: true });
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "tc3-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
