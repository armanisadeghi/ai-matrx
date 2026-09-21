import { chromium } from "playwright";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";
const ORIGIN = "http://reldisp2.localhost:3001";
const OUT = resolve(process.cwd(), "../common-docs/operations/for-arman/2026-09-21");
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin");
await setOrganization(page, "Rincon Plumbing Co");
await page.keyboard.press("Escape");
await page.evaluate(() => { for (const id of ["#menu-group-organization","#shell-sidebar-toggle"]) { const e=document.querySelector(id); if(e instanceof HTMLInputElement && e.checked) e.click(); } });
await page.goto(`${ORIGIN}/data-v2/${JOBS}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(11000);
// A person picks the column to group by — the board says so itself.
const picked = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button,option,[role='option'],[role='menuitem']")).find(x=>(x.textContent??"").trim()==="Status");
  if(!b) return false; b.click(); return true;
});
console.log("picked 'Status' to group by:", picked);
await sleep(10000);
await page.screenshot({ path: resolve(OUT, "reldisp-06-board-after.png") });
const t = await page.evaluate(() => document.body.innerText);
console.log("board carries joined customer words:", (t.match(/[A-Z][a-z]+ [A-Z][a-z]+, [A-Z][a-z]+/g)??[]).slice(0,6));
console.log("board card titles:", (t.match(/RPC-\d+/g)??[]).slice(0,6));
const i = t.indexOf("Scheduled");
console.log("BOARD EXCERPT:", JSON.stringify(t.slice(Math.max(0,i-120), i+700)));
await browser.close();
