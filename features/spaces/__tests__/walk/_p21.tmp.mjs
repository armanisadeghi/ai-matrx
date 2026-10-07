import { start, S } from "./_h.tmp.mjs";
const { browser, page } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const db = page.locator('.bn-block-content[data-content-type="database"]').first();
const menus=()=>page.locator("[role=menu],[role=dialog],[role=listbox],[data-radix-popper-content-wrapper]").last().innerText().catch(()=>"none");
await db.getByRole("button",{name:"View settings"}).click(); await page.waitForTimeout(800);
await page.getByText("Properties",{exact:true}).last().click(); await page.waitForTimeout(1000);
console.log("PROPS:", (await menus()).replace(/\n+/g," | "));
await page.screenshot({ path: `${S}/shots/21a.png`, clip:{x:700,y:500,width:740,height:700} });
const np = page.getByText(/New property|Add a property|Add property/i).first();
if (await np.isVisible().catch(()=>false)) { await np.click(); await page.waitForTimeout(1000); console.log("NEWPROP:", (await menus()).replace(/\n+/g," | ")); await page.screenshot({ path: `${S}/shots/21b.png`, clip:{x:700,y:500,width:740,height:700} }); }
await browser.close();
