import { start, S, dump, lastParaIn, focusLastPara, addPageLink } from "./_h.tmp.mjs";
import { slash, setBlockColor } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const log=(...a)=>console.log(...a);
const sl = async (q,n)=>{ for(let a=0;a<3;a++){ try{ await page.waitForTimeout(600); await slash(page,q,n); return; }catch(e){ log("slash retry",q); await page.keyboard.press("Escape"); await page.keyboard.press("Backspace"); } } throw new Error("slash "+q); };
const have = await dump(page); log("state:", have);
if(!have.includes("columnList")){ await page.mouse.click(700,531); await page.waitForTimeout(600); await sl("2 col","2 columns"); await page.waitForTimeout(1200);
const p1 = await page.evaluate(()=>{const e=document.querySelector('.bn-editor [data-content-type="paragraph"]').getBoundingClientRect(); return {x:e.x+30,y:e.y+10}});
await page.mouse.click(p1.x,p1.y); await page.waitForTimeout(600);
await sl("Callout","Callout"); await page.keyboard.type("IMPLEMENTATION CHECKLIST");
await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
await sl("Divider","Divider"); }
const sections = [["CLIENTS",["Clients OS","NPS Surveys","Client Wins"]],["FULFILLMENT",["Fulfillment Funnel OS","Fulfillment Interface","SOP Library"]],["TEAM BOARDS",["CORA","Zunayed Editing Powerhouse"]]];
let first=false; await page.waitForTimeout(0);
for (const [h,pages] of sections){ if((await dump(page)).includes("heading:"+h)) { log("skip",h); continue; }
  if(!first){ await focusLastPara(page,"L"); } first=false;
  await sl("Heading 3","Heading 3"); await page.keyboard.type(h); await page.keyboard.press("Enter");
  try { await setBlockColor(page, page.locator('.bn-block-content[data-content-type="heading"]').filter({hasText:h}).first(), "Background","Gray"); } catch(e){ log("bg color fail",h,e.message.slice(0,60)); }
  for (const t of pages){ try { await addPageLink(page,t,"L"); } catch(e){ log("page fail",t,e.message.slice(0,120)); await page.goto("http://sbba208aa.localhost:3001/spaces/"+id).catch(()=>{}); await page.locator(".bn-editor").first().waitFor(); await page.waitForTimeout(3000);} }
  log(h,"done:", await dump(page));
}
await page.waitForTimeout(5000);
await page.screenshot({ path: `${S}/shots/16-left.png` });
await browser.close();
