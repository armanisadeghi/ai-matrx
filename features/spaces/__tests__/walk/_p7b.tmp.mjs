import { start, S } from "./_h.tmp.mjs";
const { browser, page } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(800);
console.log(await page.evaluate(()=>[...document.querySelectorAll(".bn-editor [data-content-type], .bn-editor .bn-block-column, .bn-editor .bn-block-column-list")].map(e=>{const r=e.getBoundingClientRect();return (e.dataset.contentType||e.className.slice(0,30))+" x"+Math.round(r.x)+" y"+Math.round(r.y)+" w"+Math.round(r.width)+" h"+Math.round(r.height)}).join("\n")));
await browser.close();
