import { start, S, dump, focusLastPara, addPageLink } from "./_h.tmp.mjs";
import { slash, setBlockColor } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const log=(...a)=>console.log(...a);
console.log("START:", await dump(page)); await page.screenshot({path:`${S}/shots/13-start.png`});
const sections = [["CLIENTS",["Clients OS","NPS Surveys","Client Wins"]],["FULFILLMENT",["Fulfillment Funnel OS","Fulfillment Interface","SOP Library"]],["TEAM BOARDS",["CORA","Zunayed Editing Powerhouse"]]];
for (const [h,pages] of sections){
  await focusLastPara(page,"L"); await page.waitForTimeout(500);
  await slash(page,"Heading 3","Heading 3"); await page.keyboard.type(h); await page.keyboard.press("Enter");
  try { await setBlockColor(page, page.locator('.bn-block-content[data-content-type="heading"]').filter({hasText:h}).first(), "Background","Gray"); } catch(e){ log("bg color fail",h,e.message.slice(0,60)); }
  for (const t of pages){
    for (let a=0;a<2;a++){ try { await addPageLink(page,t,"L"); break; } catch(e){ log("page fail",t,a,e.message.slice(0,200), page.url()); await page.screenshot({path:`${S}/shots/13-fail-${t.slice(0,4)}${a}.png`}); await page.goto("http://sbba208aa.localhost:3001/spaces/"+id); await page.locator(".bn-editor").first().waitFor(); await page.waitForTimeout(3000);} }
  }
  log(h,"done:", await dump(page));
}
await page.screenshot({ path: `${S}/shots/13-left.png` });
await page.waitForTimeout(5000);
await browser.close();
