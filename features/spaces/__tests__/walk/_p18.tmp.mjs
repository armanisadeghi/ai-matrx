import { start, S, dump, lastParaIn } from "./_h.tmp.mjs";
import { slash } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const p = await lastParaIn(page,"R"); await page.mouse.click(p.x,p.y); await page.waitForTimeout(800);
try { await slash(page,"Database - Inline","Database - Inline"); } catch(e){ console.log("slash fail", e.message.slice(0,80)); }
await page.waitForTimeout(5000);
await page.screenshot({ path: `${S}/shots/18-db.png` });
console.log((await dump(page)).slice(-300));
console.log((await page.locator("body").innerText()).split("\n").filter(l=>/Name|Tags|Date|New|Table|Untitled|Select|Add/i.test(l)).slice(0,30).join(" | "));
await page.waitForTimeout(4000);
await browser.close();
