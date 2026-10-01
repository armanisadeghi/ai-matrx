import { openWalk, bodyText } from "../lib/harness.mjs";
import { sleep, until } from "../lib/harness.mjs";
const ctx = await openWalk("_t2explore");
const page = await ctx.page("admin");
const txt = async (n=1500) => (await bodyText(page, 20000)).replace(/\s+/g," ").slice(0,n);
let TID=process.env.TID;
async function open(q) {
  await ctx.goto(page, `/data-v2/${TID}${q}`);
  for (let k=0;k<8;k++){ const t=await txt(4000); if(/could not find out where this table is/.test(t)){ await page.getByRole("button",{name:"Try again"}).first().click().catch(()=>{}); await sleep(8000);} else if(await page.locator("thead th").count()) break; else await sleep(3000);}
  await sleep(2000);
}
async function pasteInto(selector, text) {
  return page.evaluate(({selector,text})=>{
    const el = selector ? document.querySelector(selector) : document.activeElement;
    const dt = new DataTransfer(); dt.setData("text/plain", text);
    const ev = new ClipboardEvent("paste",{clipboardData:dt,bubbles:true,cancelable:true});
    el.dispatchEvent(ev); return el.tagName+"."+(el.getAttribute("data-records-grid-wrap")||el.className.slice(0,40));
  },{selector,text});
}
try {
  if (process.env.MODE==="empty") {
    await open("?view=grid");
    console.log("PASTED ON", await pasteInto("[data-records-grid-wrap]", "Client\tPackage\tSessions\tStart\nDana Whitfield\tKnee rehab, 6 weeks\t12\t2026-10-05\nLuis Ortega\tShoulder, 8 weeks\t16\t2026-10-07\nAiko Tanaka\tBack pain, 4 weeks\t8\t2026-10-12"));
    await sleep(3000);
    console.log("EMPTY PASTE:", (await page.locator("main").innerText()).replace(/\s+/g," ").slice(0,1500));
    await ctx.shot(page,"emptypaste");
  } else {
    await open("?view=grid");
    const cell = page.locator("tbody tr").first().locator("td").nth(3);
    await cell.click(); await sleep(500);
    console.log("ACTIVE", await page.evaluate(()=>document.activeElement.tagName+" "+document.activeElement.className.slice(0,60)+" "+(document.activeElement.getAttribute("data-cell")||"")));
    console.log("PASTED ON", await pasteInto(null, "30\t2026-10-01\n40\t2026-10-02\n55\t2026-10-03"));
    await sleep(4000);
    console.log("AFTER:", (await page.locator("main").innerText()).replace(/\s+/g," ").slice(0,1500));
    await ctx.shot(page,"cellpaste");
  }
} finally { await ctx.finish(); }
