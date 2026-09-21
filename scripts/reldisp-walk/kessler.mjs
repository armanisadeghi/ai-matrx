/**
 * THE KESSLER LAB WALK — lane RELATION-DISPLAY-2, 2026-09-21.
 *
 * THE USE CASE: Kessler Lab for Applied Microbial Ecology runs experiments, each
 * with a lead researcher. Its experiments table has no link to its researchers
 * table at all today — measured, not assumed — so this walk DECLARES one through
 * the builder, which is the other half of the builder's job (the Rincon walk only
 * edited an existing relation). A lab has several people called by first name in
 * conversation, so the column shows NAME and EMAIL: the way a PI actually tells
 * two postdocs apart.
 *
 * node scripts/reldisp-walk/kessler.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://reldisp2.localhost:3001";
const OUT = process.env.WALK_OUT ?? resolve(process.cwd(), "../common-docs/operations/for-arman/2026-09-21");
mkdirSync(OUT, { recursive: true });
const EXPERIMENTS = "7929e197-cba4-4128-8445-870209dd0335";
const out = { ranAt: new Date().toISOString(), steps: {} };
const txt = (p) => p.evaluate(() => document.body.innerText);
const shot = (p, n) => p.screenshot({ path: resolve(OUT, `reldisp-kessler-${n}.png`) });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
out.identity = await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin");
console.log("identity the app reports:", out.identity);
await setOrganization(page, "Kessler Lab for Applied Microbial Ecology");
await page.keyboard.press("Escape");
await page.evaluate(() => { for (const id of ["#menu-group-organization","#shell-sidebar-toggle"]) { const e=document.querySelector(id); if(e instanceof HTMLInputElement && e.checked) e.click(); } });

await page.goto(`${ORIGIN}/data-v2/${EXPERIMENTS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(11000);
await shot(page, "01-experiments-before");
console.log("1. experiments grid columns:", (await txt(page)).match(/\n([A-Z][A-Z ]{3,})\n/g)?.slice(0,10));

// ── ADD A FIELD, THROUGH THE SAME PANEL A PERSON USES ────────────────────────
await page.evaluate(() => {
  const bs = Array.from(document.querySelectorAll("button")).filter((x)=>(x.textContent??"").trim()==="Settings");
  bs[bs.length-1]?.click();
});
await sleep(4000);
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x)=>(x.textContent??"").trim()==="Add a field");
  b?.click();
});
await sleep(4000);
await shot(page, "02-new-field");

// Name it.
await page.evaluate(() => {
  const i = Array.from(document.querySelectorAll("input")).find((x)=>x.offsetParent!==null && !x.getAttribute("aria-label")?.includes("Search"));
  if (!(i instanceof HTMLInputElement)) return;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set;
  set?.call(i, "Lead Researcher"); i.dispatchEvent(new Event("input",{bubbles:true}));
});
await sleep(1500);
// Choose "points at another record".
const chose = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button,[role='option'],option")).find((x)=>/points at another record/i.test(x.textContent??""));
  if(!b) return false; b.click(); return true;
});
console.log("2. chose 'points at another record':", chose);
await sleep(3500);
await shot(page, "03-kind-chosen");
const t = await txt(page);
console.log("   builder's words on screen:", ["The table it points at","Shown as","Show different columns","It will read"].filter(k=>t.includes(k)).join(" | ") || "(none)");
const i = t.indexOf("The table it points at");
console.log("   BUILDER:", JSON.stringify(t.slice(Math.max(0,i-200), i+600)));
writeFileSync(resolve(OUT, "reldisp-kessler-progress.json"), JSON.stringify(out,null,2));
await browser.close();
