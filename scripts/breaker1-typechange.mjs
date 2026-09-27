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
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(1500);
  const toolbar = page.locator('[data-table-toolbar]').first();
  await toolbar.locator('button').nth(17).click({force:true});
  await sleep(1000);
  // find appointment_status card and change its "Shows as" combobox from Choice -> Text
  const info = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]');
    const captionEls = Array.from(dialog.querySelectorAll('div')).filter(d => /•\s*appointment_status$/.test(d.textContent||'') && d.children.length===0);
    if (!captionEls.length) return { found:false };
    let card = captionEls[0];
    for (let i=0;i<6 && card;i++){ card = card.parentElement; if (card && card.querySelectorAll('button[role=combobox]').length>=2) break; }
    return { found:true, hasCard: !!card, combos: card?.querySelectorAll('button[role=combobox]').length };
  });
  console.log("info:", info);
  const card = page.locator('[role=dialog]').locator('text=/•\\s*appointment_status$/').first().locator('xpath=ancestor::div[position()<=4][.//button[@role="combobox"]]').first();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, "typechange-card.png"), fullPage: true });
  const combos = card.locator('button[role=combobox]');
  const n = await combos.count();
  console.log("combos in card:", n);
  // second combobox = "Shows as"
  await combos.nth(1).click();
  await sleep(400);
  await page.screenshot({ path: join(SHOTS, "typechange-showsas-open.png"), fullPage: true });
  await page.locator('[role="option"]', { hasText: /^Text[^\n]*Plain single-line/ }).first().click();
  await sleep(500);
  await page.screenshot({ path: join(SHOTS, "typechange-selected-text.png"), fullPage: true });
  const txt = await page.evaluate(() => document.body.innerText.slice(-1500));
  console.log(txt);
  const saveBtn = page.getByRole("button", { name: "Save Changes", exact: true });
  console.log("save enabled:", await saveBtn.isEnabled().catch(()=>false));
  await saveBtn.click({force:true});
  await sleep(2500);
  await page.screenshot({ path: join(SHOTS, "typechange-after-save.png"), fullPage: true });
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "typechange-error.png") }).catch(()=>{});
} finally {
  console.log("CONSOLE:\n", consoleMsgs.join("\n"));
  await browser.close();
}
