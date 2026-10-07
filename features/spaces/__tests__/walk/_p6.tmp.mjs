import { start, S } from "./_h.tmp.mjs";
import { slash } from "./lib.mjs";
const { browser, page } = await start();
await page.mouse.click(700,521);
await slash(page,"2 col","2 columns");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${S}/shots/07-cols.png` });
console.log(await page.evaluate(()=>[...document.querySelectorAll(".bn-editor [data-content-type]")].map(e=>e.dataset.contentType).join(",")));
// which element has focus / caret
console.log(await page.evaluate(()=>{const s=getSelection().anchorNode; return s&&(s.nodeType==3?s.parentElement:s).closest("[data-content-type]")?.dataset.contentType}));
await browser.close();
