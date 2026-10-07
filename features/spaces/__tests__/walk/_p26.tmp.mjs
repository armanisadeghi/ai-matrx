import { start, S, dump } from "./_h.tmp.mjs";
import { slash } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1700});
await page.waitForTimeout(3000);
const log=(...a)=>console.log(...a);
const sl = async (q,n)=>{ for(let a=0;a<3;a++){ try{ await page.waitForTimeout(600); await slash(page,q,n); return true; }catch(e){ await page.keyboard.press("Escape"); for(let i=0;i<q.length+1;i++) await page.keyboard.press("Backspace"); } } log("SLASH FAIL",q); return false; };
const typ = async t=>{ await page.keyboard.type(t,{delay:12}); };
// chart
try { const p = await page.evaluate(()=>{const ps=[...document.querySelectorAll('.bn-editor [data-content-type="paragraph"]')].filter(e=>e.getBoundingClientRect().x>=840); const r=ps.at(-1).getBoundingClientRect(); return {x:r.x+20,y:r.y+r.height/2}});
  await page.mouse.click(p.x,p.y); await page.waitForTimeout(500);
  await sl("chart","Chart"); await page.waitForTimeout(2000);
  await page.getByText("Tasks",{exact:true}).first().click(); await page.waitForTimeout(4000);
  await page.screenshot({path:`${S}/shots/26-chart.png`}); log("chart:", (await dump(page)).slice(-160)); log("dialog:", (await page.locator("[role=dialog]").allInnerTexts()).join("|").slice(0,300).replace(/\n/g," ")); await page.keyboard.press("Escape"); } catch(e){ log("chart fail", e.message.slice(0,120)); }
// lower sections: click below the columns
const bottom = await page.evaluate(()=>Math.max(...[...document.querySelectorAll('.bn-editor [data-content-type]')].map(e=>e.getBoundingClientRect().bottom)));
await page.mouse.click(700, bottom+30); await page.waitForTimeout(600);
await typ("90 Day Plan");
const info = await page.evaluate(()=>{const s=getSelection().anchorNode; const e=(s.nodeType==3?s.parentElement:s); const b=e.closest(".bn-block-outer"); const r=b.getBoundingClientRect(); return "x"+Math.round(r.x)+" w"+Math.round(r.width)+" in column? "+!!e.closest(".bn-block-column,[data-content-type=column]")});
log("90 Day Plan block:", info);
await page.keyboard.press("Enter");
try { await sl("link","Link to page"); await page.waitForTimeout(1500); await page.keyboard.press("Enter"); await page.waitForTimeout(1500); log("linked:", (await dump(page)).slice(-100)); } catch(e){ log("link fail"); }
await page.keyboard.press("Escape");
await page.screenshot({path:`${S}/shots/26-lower.png`});
log("end:", (await dump(page)).slice(-300));
await page.waitForTimeout(5000);
await browser.close();
