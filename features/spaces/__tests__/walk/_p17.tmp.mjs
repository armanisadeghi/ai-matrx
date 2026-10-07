import { start, S, dump } from "./_h.tmp.mjs";
import { slash } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const log=(...a)=>console.log(...a);
async function afterHeading(h, title){
  for(let a=0;a<3;a++){
    try{
      const pos = await page.evaluate((h)=>{const e=[...document.querySelectorAll('.bn-editor [data-content-type="heading"]')].find(x=>x.innerText.trim()===h); const r=e.getBoundingClientRect(); return {x:r.x+r.width-10,y:r.y+r.height/2}},h);
      await page.mouse.click(pos.x,pos.y); await page.waitForTimeout(400); await page.keyboard.press("End"); await page.keyboard.press("Enter"); await page.waitForTimeout(800);
      await slash(page,"Page","Page"); break;
    }catch(e){ log("retry",h,title); await page.keyboard.press("Escape"); await page.waitForTimeout(800); }
  }
  await page.waitForTimeout(2500);
  await page.mouse.click(700,237); await page.keyboard.type(title); await page.waitForTimeout(4500);
  await page.goBack(); await page.locator(".bn-editor").first().waitFor(); await page.waitForTimeout(3000);
}
const todo=[["CLIENTS","Client Wins"],["CLIENTS","NPS Surveys"],["CLIENTS","Clients OS"],["FULFILLMENT","Fulfillment Funnel OS"],["TEAM BOARDS","CORA"]];
for(const [h,t] of todo){ try{ await afterHeading(h,t);}catch(e){ log("FAIL",h,t,e.message.slice(0,100)); await page.goto("http://sbba208aa.localhost:3001/spaces/"+id).catch(()=>{}); await page.locator(".bn-editor").first().waitFor(); await page.waitForTimeout(3000);} log(t,":",(await dump(page)).slice(0,400)); }
await page.waitForTimeout(5000);
await page.screenshot({ path: `${S}/shots/17-left.png` });
await browser.close();
