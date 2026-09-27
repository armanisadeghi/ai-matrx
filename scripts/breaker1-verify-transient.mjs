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
  const toolbar = page.locator('[data-table-toolbar]').first();
  await toolbar.locator('button').nth(17).click({force:true});
  await sleep(1000);
  // change service_type back? no - let's just toggle Required on Title (a trivial no-risk change) to trigger a Save Changes and observe the transient state timeline.
  const result = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]');
    const all = Array.from(dialog.querySelectorAll('*'));
    const matches = all.filter(el => (el.textContent||'').trim() === '#10 • title');
    const caption = matches[matches.length-1];
    if (!caption) return { ok:false };
    let el = caption;
    for (let i=0;i<10;i++){
      el = el.parentElement;
      if (!el) break;
      const cb = el.querySelector('input[type=checkbox]');
      if (cb) { el.setAttribute('data-breaker-card','title'); return { ok:true }; }
    }
    return { ok:false };
  });
  console.log("find title req checkbox:", result);
  const card = page.locator('[data-breaker-card="title"]');
  await card.locator('input[type=checkbox]').click({force:true});
  await sleep(400);
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  for (let t=0; t<=6000; t+=1000) {
    await sleep(1000);
    const headers = await page.locator('[role="columnheader"], th').allInnerTexts().catch(()=>[]);
    console.log(`t+${t+1000}ms headers count:`, headers.length, headers.slice(0,4));
  }
  await page.screenshot({ path: join(SHOTS, "transient-timeline-final.png"), fullPage: true });
} catch (e) {
  console.log("ERROR:", e.message);
  await page.screenshot({ path: join(SHOTS, "transient-error.png") }).catch(()=>{});
} finally {
  await browser.close();
}
