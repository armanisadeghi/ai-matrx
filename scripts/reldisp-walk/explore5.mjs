import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";
const ORIGIN = "http://reldisp2.localhost:3001";
const OUT = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/walk";
mkdirSync(OUT, { recursive: true });
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin");
await setOrganization(page, "Rincon Plumbing Co");
// SHUT THE PICKER AND THE SIDEBAR — a person does this by clicking away; a
// walk that leaves the rail open has every grid click land on an organization row.
await page.keyboard.press("Escape");
await page.evaluate(() => {
  const g = document.querySelector("#menu-group-organization");
  if (g instanceof HTMLInputElement && g.checked) g.click();
  const s = document.querySelector("#shell-sidebar-toggle");
  if (s instanceof HTMLInputElement && s.checked) s.click();
});
await sleep(1500);
await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(9000);
await page.screenshot({ path: resolve(OUT, "x5-grid.png") });

const say = async (tag) => {
  const t = await page.evaluate(() => document.body.innerText);
  const keys = ["The table it points at","Shown as","Show different columns","It will read","Save","Field name"];
  console.log(`  ${tag}:`, keys.filter((k)=>t.includes(k)).join(" | ") || "(none of the builder's words)");
  return t;
};

console.log("A. click the table toolbar Settings");
await page.evaluate(() => {
  const bs = Array.from(document.querySelectorAll("button")).filter((x)=>(x.textContent??"").trim()==="Settings");
  const b = bs[bs.length-1]; b?.scrollIntoView({block:"center"}); b?.click();
});
await sleep(4000);
await page.screenshot({ path: resolve(OUT, "x5-settings.png") });
const t1 = await say("after Settings");
console.log("  fields listed:", /Fields/.test(t1));
console.log("  panel excerpt:", JSON.stringify(t1.slice(t1.indexOf("Fields"), t1.indexOf("Fields")+400)));

console.log("B. click the Customer row in the field list");
const clicked = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button,[role='button'],li")).filter((x)=>(x.textContent??"").trim().startsWith("Customer"));
  const target = b[0]; if(!target) return false; target.scrollIntoView({block:"center"}); target.click(); return true;
});
console.log("  clicked:", clicked);
await sleep(4000);
await page.screenshot({ path: resolve(OUT, "x5-fieldeditor.png") });
const t2 = await say("after Customer");
const i = t2.indexOf("Shown as") >= 0 ? t2.indexOf("Shown as") : t2.indexOf("The table it points at");
if (i>=0) console.log("  BUILDER CONTEXT:", JSON.stringify(t2.slice(Math.max(0,i-500), i+700)));
await browser.close();
