import { start, S, dump } from "./_h.tmp.mjs";
import { slash } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:2400});
await page.waitForTimeout(3000);
const log=(...a)=>console.log(...a);
const sl = async (q,n)=>{ for(let a=0;a<3;a++){ try{ await page.waitForTimeout(600); await slash(page,q,n); return true; }catch(e){ await page.keyboard.press("Escape"); for(let i=0;i<q.length+1;i++) await page.keyboard.press("Backspace"); } } log("SLASH FAIL",q); return false; };
const typ = async t=>{ await page.keyboard.type(t,{delay:10}); };
const K = k=>page.keyboard.press(k);
const last = await page.evaluate(()=>{const ps=[...document.querySelectorAll('.bn-editor [data-content-type="paragraph"]')]; const r=ps.at(-1).getBoundingClientRect(); return {x:r.x+30,y:r.y+r.height/2}});
await page.mouse.click(last.x,last.y); await page.waitForTimeout(500);
try {
await sl("heading 2","Heading 2"); await typ("Brain Dump"); await K("Enter");
await sl("to-do","To-do list");
await typ("Do the ideas for JetQuest"); await K("Enter");
await typ("Send a message to Darlene with her tasks for the rest of the week"); await K("Enter"); await K("Tab");
await typ("Planning the covers"); await K("Enter"); await typ("Re-doing the current JetQuest feed"); await K("Enter");
await typ("Ask her to post on TikTok and LinkedIn"); await K("Enter"); await K("Shift+Tab");
await typ("Set up Cora's Organic Portal"); await K("Enter"); await K("Enter"); await page.waitForTimeout(500);
log("braindump:", (await dump(page)).slice(-260));
// check some
const boxes = page.locator('.bn-block-content[data-content-type="checkListItem"] input[type=checkbox]');
log("checkboxes:", await boxes.count());
for (const i of [1,2,3]) await boxes.nth(i).click().catch(e=>log("check fail",i));
} catch(e){ log("braindump fail", e.message.slice(0,120)); }
const toggles = [["Other To Dos","todo"],["Gina Notes","bullet"],["Darlene Training Project","numbered"]];
for (const [t,kind] of toggles){
  try {
    const l = await page.evaluate(()=>{const ps=[...document.querySelectorAll('.bn-editor [data-content-type]')].filter(e=>e.getBoundingClientRect().x<530 && e.dataset.contentType==="paragraph"); const r=ps.at(-1).getBoundingClientRect(); return {x:r.x+30,y:r.y+r.height/2}});
    await page.mouse.click(l.x,l.y); await page.waitForTimeout(400);
    await sl("toggle","Toggle list"); await typ(t); await K("Enter"); await K("Tab");
    if(kind==="todo"){ await sl("to-do","To-do list"); await typ("Update Jonathon's ManyChat flow"); await K("Enter"); await typ("Regroup on Darlene's training project"); await K("Enter"); await typ("Set up Jonathon's re-posting automation"); await K("Enter"); await K("Tab"); await typ("Research how"); await K("Enter"); await typ("Set it up"); }
    if(kind==="bullet"){ await sl("bullet","Bulleted list"); await typ("Beverage, 4 posts a week"); await K("Enter"); await typ("Mission Yoga, 4 posts a week"); await K("Enter"); await K("Tab"); await typ("1 carousel, 2 static, 1 reel"); }
    if(kind==="numbered"){ await sl("numbered","Numbered list"); await typ("1st SOP"); await K("Enter"); await typ("2nd SOP"); await K("Enter"); await typ("3rd SOP"); }
    for(let i=0;i<4;i++){ await K("Enter"); } await page.waitForTimeout(600);
    log(t,":", (await dump(page)).slice(-220));
  } catch(e){ log("toggle fail",t,e.message.slice(0,100)); }
}
await page.waitForTimeout(6000);
await page.screenshot({path:`${S}/shots/27-full.png`, fullPage:true});
await browser.close();
