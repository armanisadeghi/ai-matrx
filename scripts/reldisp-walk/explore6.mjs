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
await page.keyboard.press("Escape");
await page.evaluate(() => {
  const g = document.querySelector("#menu-group-organization");
  if (g instanceof HTMLInputElement && g.checked) g.click();
  const s = document.querySelector("#shell-sidebar-toggle");
  if (s instanceof HTMLInputElement && s.checked) s.click();
});
await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(9000);
await page.evaluate(() => {
  const bs = Array.from(document.querySelectorAll("button")).filter((x)=>(x.textContent??"").trim()==="Settings");
  bs[bs.length-1]?.click();
});
await sleep(4000);

// THE "Edit" THAT BELONGS TO CUSTOMER — found by walking up to the row that
// names Customer, then down to its own Edit, never the first Edit on the panel.
const opened = await page.evaluate(() => {
  const edits = Array.from(document.querySelectorAll("button")).filter((b)=>(b.textContent??"").trim()==="Edit");
  for (const e of edits) {
    let row = e.parentElement;
    for (let i=0;i<5 && row;i++){
      const txt = (row.textContent ?? "");
      if (txt.startsWith("Customer") && txt.includes("Points at another record")) { e.click(); return true; }
      row = row.parentElement;
    }
  }
  return false;
});
console.log("opened Customer's editor:", opened);
await sleep(4500);
await page.screenshot({ path: resolve(OUT, "x6-fieldeditor.png") });
const t = await page.evaluate(() => document.body.innerText);
for (const k of ["The table it points at","Shown as","Show different columns","It will read","Save"])
  console.log(`  "${k}": ${t.includes(k)}`);
const i = t.indexOf("Shown as");
console.log("BUILDER PANEL:", JSON.stringify(t.slice(Math.max(0,i-700), i+900)));
console.log("---- checkbox / controls ----");
console.table(await page.evaluate(() => Array.from(document.querySelectorAll('button,input,[role="checkbox"]'))
  .map((b)=>({tag:b.tagName, type:b.getAttribute("type"), text:(b.textContent??"").trim().slice(0,35), label:b.getAttribute("aria-label")}))
  .filter((c)=>c.text||c.label).slice(0,45)));
await browser.close();
