// TAILS-6 proof: the Checklists tab and the Dashboards tab, after the fix.
//
// The Dashboards half is watched on the real screen. The Checklists half is a
// TRANSPORT failure — the store never answers — so it is provoked here the way
// it actually happens: the door's request is failed at the network, which is
// exactly what `code: ""` from supabase-js means. Nothing is mocked in the
// package; the real client meets a real failed fetch and the real screen draws
// what it draws.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = "http://127.0.0.1:3001";
const OUT = process.argv[2];
const ORG = process.argv[3] ?? "Rincon Plumbing Co";
const WANT = process.argv[4] ?? "Jobs";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
const page = await ctx.newPage();

console.log("signed in as", await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD));
console.log("org:", ORG, await setOrganization(page, ORG));

await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded" });
await sleep(5000);
await page.evaluate((want) => {
  const leaf = Array.from(document.querySelectorAll("body *")).find(
    (el) => el.children.length === 0 && (el.textContent ?? "").trim() === want,
  );
  const t = leaf?.closest("button, a, [role='button'], li, div[class*='rounded']");
  t?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}, WANT);
await sleep(6000);
const table = new URL(page.url()).pathname;
console.log("table:", table);

const press = async (label) => page.evaluate((l) => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").trim() === l);
  b?.click();
  return !!b;
}, label);

const leaks = (text) =>
  text.split("\n").filter((l) => /SQLSTATE|RecordsUiProvider|@ai-matrx|bind `/.test(l));

// ── 1. Checklists, with the store unreachable ────────────────────────────────
await page.route("**/rest/v1/rpc/checklist_templates*", (r) => r.abort("failed"));
await page.goto(`${ORIGIN}${table}`, { waitUntil: "domcontentloaded" });
await sleep(5000);
console.log("Checklists pressed:", await press("Checklists"));
await sleep(6000);
await page.screenshot({ path: resolve(OUT, "tails6-checklists-unreachable.png"), fullPage: true });
const checklists = await page.evaluate(() => document.body.innerText);
writeFileSync(resolve(OUT, "tails6-checklists.txt"), checklists);
console.log("CHECKLISTS LEAKS:", JSON.stringify(leaks(checklists)));
console.log("CHECKLISTS SAYS:", checklists.split("\n").filter((l) => /could not reach|Nothing was changed/i.test(l)));
await page.unroute("**/rest/v1/rpc/checklist_templates*");

// ── 2. Dashboards, with openRecords bound ────────────────────────────────────
await page.goto(`${ORIGIN}${table}`, { waitUntil: "domcontentloaded" });
await sleep(5000);
console.log("Dashboards pressed:", await press("Dashboards"));
await sleep(8000);
await page.screenshot({ path: resolve(OUT, "tails6-dashboards-bound.png"), fullPage: true });
const dash = await page.evaluate(() => document.body.innerText);
writeFileSync(resolve(OUT, "tails6-dashboards.txt"), dash);
console.log("DASHBOARDS LEAKS:", JSON.stringify(leaks(dash)));

// A bar, clicked.
const clicked = await page.evaluate(() => {
  const bar = document.querySelector("svg .recharts-bar-rectangle, svg .recharts-rectangle, svg .recharts-sector, svg rect[role='button'], svg path[role='button']");
  if (!bar) return false;
  const r = bar.getBoundingClientRect();
  for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
    bar.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  }
  return true;
});
console.log("bar clicked:", clicked);
await sleep(7000);
console.log("landed on:", page.url());
await page.screenshot({ path: resolve(OUT, "tails6-drill-through.png"), fullPage: true });
const drill = await page.evaluate(() => document.body.innerText);
writeFileSync(resolve(OUT, "tails6-drill.txt"), drill);
console.log("CAME FROM:", drill.split("\n").filter((l) => /You came here from/.test(l)));
console.log("DRILL LEAKS:", JSON.stringify(leaks(drill)));

await browser.close();
