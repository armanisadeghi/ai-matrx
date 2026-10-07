import { start, S } from "./_h.tmp.mjs";
import { slash } from "./lib.mjs";
const { browser, page } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(500);
if(!(await page.locator('[data-content-type="column"]').count())){ await page.locator(".bn-editor").first().click(); await page.locator('.bn-block-content[data-content-type="paragraph"]').first().click(); await slash(page,"2 col","2 columns"); await page.waitForTimeout(1000);}
const cols = page.locator('.bn-block-content[data-content-type="paragraph"]');
console.log("paras", await cols.count());
await page.mouse.click(600,530); await page.waitForTimeout(500); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await page.waitForTimeout(300);
await page.waitForTimeout(500); await slash(page,"Callout","Callout");
await page.keyboard.type("IMPLEMENTATION CHECKLIST");
await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); // exit callout?
await page.waitForTimeout(500);
console.log(await page.evaluate(()=>[...document.querySelectorAll(".bn-editor [data-content-type]")].map(e=>e.dataset.contentType+":"+e.innerText.slice(0,20).replace(/\n/g," ")).join(" | ")));
await slash(page,"Divider","Divider");
await slash(page,"Heading 3","Heading 3");
await page.keyboard.type("CLIENTS"); await page.keyboard.press("Enter");
await slash(page,"Page","Page");
await page.waitForTimeout(3000);
console.log("URL", page.url());
await page.screenshot({ path: `${S}/shots/08-left.png` });
console.log(await page.evaluate(()=>[...document.querySelectorAll(".bn-editor [data-content-type]")].map(e=>e.dataset.contentType+":"+e.innerText.slice(0,20).replace(/\n/g," ")).join(" | ")));
await page.waitForTimeout(7000);
await browser.close();
