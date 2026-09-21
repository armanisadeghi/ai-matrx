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

// THE TWO MARIA CHENS, on the grid.
await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(11000);
const cells = await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label="Edit Customer"]')).map(b=>(b.textContent??"").trim()).filter(t=>t&&t!=="—"));
console.log("THE MARIA CHEN ROWS NOW READ:", [...new Set(cells.filter(c=>c.startsWith("Maria Chen")))]);
console.log("any bare 'Maria Chen' left:", cells.filter(c=>c==="Maria Chen").length);

// THE BOARD — what does a card actually carry?
await page.goto(`${ORIGIN}/data-v2/${JOBS}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(12000);
await page.screenshot({ path: resolve(OUT, "reldisp-06-board-after.png") });
const t = await page.evaluate(() => document.body.innerText);
const i = t.indexOf("Scheduled");
console.log("---- BOARD TEXT AROUND THE COLUMNS ----");
console.log(JSON.stringify(t.slice(Math.max(0,i-200), i+900)));
console.log("board mentions any city:", /Ashport|Dellwood|Fairhaven|Millbrook|Rincon|Ojai/.test(t));
console.log("board mentions RPC- card titles:", (t.match(/RPC-\d+/g)??[]).slice(0,5));
// What is the board grouped by, and what does a card show?
console.log("---- GALLERY, which shows more of a record ----");
await page.goto(`${ORIGIN}/data-v2/${JOBS}?view=gallery`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(12000);
await page.screenshot({ path: resolve(OUT, "reldisp-08-gallery-after.png") });
const g = await page.evaluate(() => document.body.innerText);
console.log("gallery joined words:", (g.match(/[A-Z][a-z]+ [A-Z][a-z]+, [A-Z][a-z]+/g)??[]).slice(0,6));
await browser.close();
