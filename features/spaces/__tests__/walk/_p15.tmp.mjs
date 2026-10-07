import { start, S, dump } from "./_h.tmp.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1100});
await page.waitForTimeout(3000);
console.log(id, "H1:", await page.locator("h1").allInnerTexts(), "|", await page.title());
console.log(await dump(page));
await page.screenshot({ path: `${S}/shots/15.png` });
await browser.close();
