import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { sleep } from "./lib/seat-browser.mjs";
const ORIGIN = "http://fts5c.localhost:3001";
const OUT="/private/tmp/claude-501/-Users-armanisadeghi-code/67577819-d4bf-4669-972f-e5ba5c2428f7/scratchpad";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const resume = async () => {
  if (page.url().includes("__dev-walk")) {
    await page.getByRole("button", { name: "Resume this preview" }).click();
    await page.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180_000 });
  }
};
const go = async (path) => { await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 }); await resume(); };
await go("/login");
page.on("load", () => { if (page.url().includes("__dev-walk")) { console.log("[walk] parked — resuming"); page.getByRole("button", { name: "Resume this preview" }).click().catch(() => {}); } });
for (let n = 1; n <= 6; n += 1) {
  try {
    await resume();
    if (!page.url().includes("/login")) await go("/login");
    await page.waitForSelector("#email", { timeout: 60000 });
    await page.waitForLoadState("load").catch(() => undefined);
    await sleep(2000);
    await page.fill("#email", env.AI_ADMIN_USERNAME, { timeout: 10000 });
    await page.fill("#password", env.AI_ADMIN_PASSWORD, { timeout: 10000 });
    await page.click('button:has-text("Sign in")', { timeout: 10000 });
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
    await resume();
    break;
  } catch (e) { console.log(`[walk] sign-in try ${n}: ${String(e.message).split("\n")[0]}`); await sleep(3000 * n); }
}
const who = await page.evaluate(async () => (await (await fetch("/api/whoami")).json())?.email ?? null);
if (who !== "admin@admin.com") { await page.screenshot({ path: `${OUT}/0-signin-fail.png` }); throw new Error(`signed in as ${who} at ${page.url()}`); }
console.log("signed in as", who?.v ?? who);

const R=async(f)=>{ for(let i=0;i<6;i++){ try{ return await f(); }catch(e){ console.log("retry",String(e.message).split("\n")[0].slice(0,80)); await sleep(5000);} } };
const T="/data/5b5d2f87-ced4-43ac-8c36-d426dcb96c47";
await go(T); await sleep(15000);
console.log(await R(()=>page.evaluate(()=>(document.body.innerText.match(/\d+ rows?/)||["?"])[0]+" | "+[...document.querySelectorAll('[role=columnheader]')].map(e=>e.textContent.trim().slice(0,20)).join(","))));
await R(()=>page.screenshot({path:OUT+"/t2.png"}));
// sort: click first sortable header
const hdr=page.locator('[role=columnheader]').nth(1);
await R(()=>hdr.click());
await sleep(3000);
console.log("after sort url", page.url());
await browser.close();
