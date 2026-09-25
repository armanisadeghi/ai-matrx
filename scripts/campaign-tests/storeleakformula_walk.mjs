/**
 * STORE-LEAK-FORMULA — VERIFIER-18 finding 1 re-walked, headless, READ-ONLY, from test@test.com's
 * seat on the shared preview (live database). Rooms (admin's disposable fixture, Viewer-shared to
 * test@test.com): Budget is confidential; Budget with contingency ({Budget} * 1.1) must never show
 * her 19,800 / 67,100 / 10,450 — the store withholds it by name.
 *
 *   SLF_EMAIL=test@test.com SLF_PASSWORD=… node scripts/campaign-tests/storeleakformula_walk.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.SLF_ORIGIN ?? "http://store-leak-formula.localhost:3001";
const TABLE = "8c62d552-a893-4338-ac05-a266b2178712";
const OUT = "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/shots/store-leak-formula";
const EMAIL = process.env.SLF_EMAIL ?? "test@test.com";
const PASSWORD = process.env.SLF_PASSWORD ?? "";
if (!PASSWORD) throw new Error("SLF_PASSWORD is required (never printed)");

const LEAKS = [/19,?800/, /67,?100/, /10,?450/];
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [w, h] of [[1600, 1000], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: "America/Los_Angeles" });
    const page = await ctx.newPage();
    const bodies = [];
    page.on("response", async (r) => {
      if (/\/rest\/v1\/rpc\/(read_records|read_record|read_records_matching|read_records_by_ids)/.test(r.url())) {
        try { bodies.push(await r.text()); } catch {}
      }
    });
    const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, "test seat");
    if (who !== EMAIL) throw new Error(`signed in as ${who}, not ${EMAIL}`);
    await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    for (let i = 0; i < 60; i++) {
      const t = await page.evaluate(() => document.body.innerText);
      if (/Kitchen/.test(t)) break;
      await sleep(1000);
    }
    await sleep(2500);
    const text = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${OUT}/rooms-test-${w}.png`, fullPage: false });
    const domLeak = LEAKS.filter((re) => re.test(text)).map(String);
    const wireLeak = LEAKS.filter((re) => bodies.some((b) => re.test(b))).map(String);
    const wireNamed = bodies.some((b) => b.includes("Budget with contingency is worked out from Budget"));
    const r = { width: w, who, sawKitchen: /Kitchen/.test(text), sawColumn: /Budget with contingency/i.test(text),
                domLeak, wireLeak, doorResponses: bodies.length, wireNamed };
    results.push(r);
    console.log(JSON.stringify(r));
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/walk.json`, JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.sawKitchen || r.domLeak.length || r.wireLeak.length);
if (bad.length) { console.error("WALK RED", JSON.stringify(bad)); process.exit(1); }
console.log("WALK GREEN");
