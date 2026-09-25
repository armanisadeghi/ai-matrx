// one-off headless UI check (scratch; deleted after run)
import { chromium } from "playwright";
const [,, loginUrl, route, shot] = process.argv;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(4000);
const origin = new URL(loginUrl).origin;
await page.goto(origin + route, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(20000);
const who = await page.evaluate(() => document.body.innerText.match(/[a-z]+@[a-z]+\.com/)?.[0] ?? null);
const help = page.locator('[aria-label="Help: Eligible Mandate Holders"]').first();
let rule = null;
if (await help.count()) { await help.click(); await page.waitForTimeout(1000);
  rule = await page.evaluate(() => { const t = document.body.innerText; const i = t.indexOf("Eligible Mandate Holders"); return i >= 0 ? t.slice(i, i + 260) : null; });
  await page.keyboard.press("Escape"); }
const trigger = page.getByText("Choose an agent", { exact: true }).first();
let tabs = [];
if (await trigger.count()) {
  await trigger.click(); await page.waitForTimeout(4000);
  tabs = await page.evaluate(() => [...document.querySelectorAll('[role=tab],[role=radio],button')].map(b => (b.innerText || "").trim().replace(/\s+/g, " ")).filter(x => /^(Mine|Shared|All|System)\b/.test(x)));
}
await page.screenshot({ path: shot, fullPage: false });
console.log(JSON.stringify({ url: page.url(), who, rule, tabs }, null, 1));
await browser.close();
