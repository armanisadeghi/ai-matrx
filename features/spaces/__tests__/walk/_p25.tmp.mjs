import { start, S, dump } from "./_h.tmp.mjs";
import { slash } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const log=(...a)=>console.log(...a);
const sl = async (q,n)=>{ for(let a=0;a<3;a++){ try{ await page.waitForTimeout(600); await slash(page,q,n); return true; }catch(e){ await page.keyboard.press("Escape"); for(let i=0;i<q.length+1;i++) await page.keyboard.press("Backspace"); } } log("SLASH FAIL",q); return false; };
const typ = async t=>{ await page.keyboard.type(t,{delay:15}); };
// 1. caret below the columns?
const bottom = await page.evaluate(()=>{const r=document.querySelector('.bn-editor [data-content-type="columnList"]').getBoundingClientRect(); const cs=[...document.querySelectorAll('.bn-editor [data-content-type="column"]')]; return Math.max(...[...document.querySelectorAll(".bn-editor .bn-block-column")].map(e=>e.getBoundingClientRect().bottom),0)});
log("columns bottom", bottom);
await page.mouse.click(700, Math.max(bottom,1100)+90); await page.waitForTimeout(500);
const where = await page.evaluate(()=>{const s=getSelection().anchorNode; if(!s) return null; const e=(s.nodeType==3?s.parentElement:s); const r=e.getBoundingClientRect(); return (e.closest("[data-content-type]")?.dataset.contentType)+" x"+Math.round(r.x)+" w"+Math.round(r.width)});
log("caret after click below:", where);
// 2. chart in right column (try)
try { const p = await page.evaluate(()=>{const ps=[...document.querySelectorAll('.bn-editor [data-content-type="paragraph"]')].filter(e=>e.getBoundingClientRect().x>=840); const r=ps.at(-1).getBoundingClientRect(); return {x:r.x+20,y:r.y+r.height/2}});
  await page.mouse.click(p.x,p.y); await page.waitForTimeout(500);
  const ok = await sl("chart","Chart"); await page.waitForTimeout(2500); await page.screenshot({path:`${S}/shots/25-chart.png`}); log("chart inserted:", ok, (await page.getByRole("dialog").allInnerTexts()).join("|").slice(0,300).replace(/\n/g," ")); await page.keyboard.press("Escape"); } catch(e){ log("chart fail", e.message.slice(0,100)); }
log("state:", (await dump(page)).slice(-250));
await page.waitForTimeout(5000);
await browser.close();
