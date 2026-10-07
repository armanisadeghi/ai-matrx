import { start, S, dump, focusLastPara, addPageLink } from "./_h.tmp.mjs";
import { slash, setBlockColor, lastBlock } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const log=(...a)=>console.log(...a);
// remove stray divider in col 2 with keyboard
try { const p = await focusLastPara(page,"R"); await page.keyboard.press("Backspace"); await page.waitForTimeout(300); await page.keyboard.press("Backspace"); await page.waitForTimeout(500); log("after divider backspace:", await dump(page)); } catch(e){ log("divider kb fail", e.message.slice(0,80)); }
// left column: clear the stray text
await page.mouse.click(540,530); await page.waitForTimeout(400);
await page.keyboard.press("Meta+a"); await page.keyboard.press("Backspace"); await page.waitForTimeout(400);
log("cleared:", await dump(page));
await slash(page,"Callout","Callout"); await page.keyboard.type("IMPLEMENTATION CHECKLIST");
await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
log("callout:", await dump(page));
await slash(page,"Divider","Divider");
const sections = [["CLIENTS",["Clients OS","NPS Surveys","Client Wins"]],["FULFILLMENT",["Fulfillment Funnel OS","Fulfillment Interface","SOP Library"]],["TEAM BOARDS",["CORA","Zunayed Editing Powerhouse"]]];
let first=true;
for (const [h,pages] of sections){
  if(!first){ await focusLastPara(page,"L"); } first=false;
  await slash(page,"Heading 3","Heading 3"); await page.keyboard.type(h); await page.keyboard.press("Enter");
  try { await setBlockColor(page, page.locator('.bn-block-content[data-content-type="heading"]').filter({hasText:h}).first(), "Background","Gray"); } catch(e){ log("bg color fail",h,e.message.slice(0,60)); }
  for (const t of pages){ try { await addPageLink(page,t,"L"); } catch(e){ log("page fail",t,e.message.slice(0,100)); await page.goto(page.url().replace(/spaces\/.*/,"spaces/"+id)); await page.locator(".bn-editor").first().waitFor(); } }
  log(h,"done:", await dump(page));
}
await page.screenshot({ path: `${S}/shots/10-left.png`, fullPage:false });
await page.waitForTimeout(5000);
await browser.close();
