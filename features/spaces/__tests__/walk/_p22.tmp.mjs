import { start, S } from "./_h.tmp.mjs";
const { browser, page } = await start();
await page.setViewportSize({width:1440,height:1500});
await page.waitForTimeout(3000);
const db = page.locator('.bn-block-content[data-content-type="database"]').first();
async function addCol(name, typeRe){
  await db.getByRole("button",{name:"View settings"}).click(); await page.waitForTimeout(700);
  await page.getByText("Properties",{exact:true}).last().click(); await page.waitForTimeout(800);
  await page.getByText(/^New property$/).first().click(); await page.waitForTimeout(900);
  const d = page.getByRole("dialog").last();
  await d.getByRole("textbox").first().fill(name);
  const typeBtn = d.getByRole("combobox").first();
  await typeBtn.click(); await page.waitForTimeout(700);
  const opts = await page.getByRole("option").allInnerTexts(); console.log(name,"OPTIONS:", opts.join(" | ").replace(/\n/g," - ").slice(0,600));
  await page.screenshot({ path: `${S}/shots/22-${name}.png` });
  const o = page.getByRole("option").filter({hasText:typeRe}).first();
  if (await o.count()) await o.click(); else console.log("no option for",typeRe);
  await page.waitForTimeout(500);
  await d.getByRole("button",{name:"Create column"}).click(); await page.waitForTimeout(2500);
  console.log(name,"created; headers:", (await db.innerText()).replace(/\n+/g," | ").slice(0,200));
}
try { await addCol("Status", /select|tag/i); } catch(e){ console.log("fail Status", e.message.slice(0,200)); }
await page.keyboard.press("Escape");
try { await addCol("Date Started", /^date/i); } catch(e){ console.log("fail Date", e.message.slice(0,200)); }
await page.waitForTimeout(5000);
await browser.close();
