import { start, S } from "./_h.tmp.mjs";
const { browser, page } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const db = page.locator('.bn-block-content[data-content-type="database"]').first();
async function addCol(name, typeRe){
  await db.getByRole("button",{name:"View settings"}).click(); await page.waitForTimeout(700);
  await page.getByText("Properties",{exact:true}).last().click(); await page.waitForTimeout(800);
  await page.getByText(/^New property$/).first().click(); await page.waitForTimeout(1200);
  const d = page;
  await page.locator("[role=dialog] input").first().fill(name);
  await d.getByRole("button",{name:"What this field holds"}).click(); await page.waitForTimeout(800);
  const opts = await page.locator("[role=option],[role=menuitem],[role=menuitemradio]").allInnerTexts(); console.log(name,"OPTIONS:", opts.join(" | ").replace(/\n/g," - ").slice(0,700));
  const o = page.locator("[role=option],[role=menuitem],[role=menuitemradio]").filter({hasText:typeRe}).first();
  if (await o.count()) await o.click(); else { console.log("no option for",typeRe); await page.keyboard.press("Escape"); }
  await page.waitForTimeout(500);
  if (/tag/i.test(name)) await d.getByText("Can hold more than one").click().catch(()=>{});
  await d.getByRole("button",{name:"Create column"}).click(); await page.waitForTimeout(3000);
  console.log(name,"created:", (await db.innerText()).replace(/\n+/g," | ").slice(0,160));
}
try { await addCol("Tags", /select|tag|choice/i); } catch(e){ console.log("fail Tags", e.message.slice(0,160)); await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); }
try { await addCol("Date Started", /date/i); } catch(e){ console.log("fail Date", e.message.slice(0,160)); await page.keyboard.press("Escape"); }
await page.screenshot({ path: `${S}/shots/24.png` });
await page.waitForTimeout(4000);
await browser.close();
