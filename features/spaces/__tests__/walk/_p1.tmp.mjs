import { start, S } from "./_h.tmp.mjs";
const { browser, page, id } = await start();
console.log("ID", id, page.url());
await page.getByRole("button",{name:/Add icon/}).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${S}/shots/02-icon.png` });
console.log((await page.locator("[role=dialog],[role=tooltip],[data-radix-popper-content-wrapper]").allInnerTexts()).join("\n--\n").slice(0,800));
await browser.close();
