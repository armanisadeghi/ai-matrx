import { start, S, dump } from "./_h.tmp.mjs";
import { slash } from "./lib.mjs";
const { browser, page } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
console.log(await dump(page));
// geometry of blocks
console.log(await page.evaluate(()=>[...document.querySelectorAll(".bn-editor [data-content-type]")].map(e=>{const r=e.getBoundingClientRect();return e.dataset.contentType+" x"+Math.round(r.x)+" y"+Math.round(r.y)+" w"+Math.round(r.width)}).join("\n")));
await browser.close();
