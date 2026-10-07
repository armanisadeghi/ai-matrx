import { start, S } from "./_h.tmp.mjs";
const { browser, page } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const db = page.locator('.bn-block-content[data-content-type="database"]').first();
await db.getByRole("button",{name:"View settings"}).click(); await page.waitForTimeout(1200);
await page.screenshot({ path: `${S}/shots/20-viewsettings.png` });
console.log((await page.locator("[role=menu],[role=dialog],[role=listbox],[data-radix-popper-content-wrapper],[cmdk-root]").allInnerTexts()).join("\n--\n").slice(0,900));
await browser.close();
