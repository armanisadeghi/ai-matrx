import { start, S, dump, focusLastPara, addPageLink } from "./_h.tmp.mjs";
import { slash, blockMenu } from "./lib.mjs";
const { browser, page, id } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
// cleanup col 2: delete callout, divider, heading, page, via block menu
for (const t of ["callout","divider","heading","page"]) {
  const b = page.locator(`.bn-block-content[data-content-type="${t}"]`).first();
  if (!(await b.count())) continue;
  try { await blockMenu(page, b); await page.locator(".bn-menu-dropdown").getByText("Delete",{exact:true}).first().click(); await page.waitForTimeout(500);} catch(e){ console.log("delete fail",t,e.message.slice(0,80)); }
}
console.log("after cleanup:", await dump(page));
await browser.close();
