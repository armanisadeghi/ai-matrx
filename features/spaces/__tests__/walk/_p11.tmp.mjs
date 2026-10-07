import { start, S, dump } from "./_h.tmp.mjs";
const { browser, page } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const caret=()=>page.evaluate(()=>{const s=getSelection().anchorNode; if(!s) return null; const e=(s.nodeType==3?s.parentElement:s); const r=e.getBoundingClientRect(); return (e.closest("[data-content-type]")?.dataset.contentType)+" "+Math.round(r.x)+","+Math.round(r.y)+" txt="+e.innerText.slice(0,10)});
console.log(await page.evaluate(()=>[...document.querySelectorAll('.bn-editor [data-content-type="paragraph"]')].slice(0,2).map(e=>{const r=e.getBoundingClientRect();return Math.round(r.x)+","+Math.round(r.y)+" "+Math.round(r.width)+"x"+Math.round(r.height)+" "+e.innerText}) ));
for (const [x,y] of [[560,530],[520,520],[700,525]]) { await page.mouse.click(x,y); await page.waitForTimeout(500); console.log(x,y,"->",await caret(), "| elementFromPoint:", await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y); return e.tagName+"."+e.className.slice(0,40)},[x,y])); }
await page.keyboard.type("X"); console.log(await dump(page));
await browser.close();
