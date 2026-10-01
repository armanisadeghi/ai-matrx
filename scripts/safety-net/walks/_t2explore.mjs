import { openWalk, bodyText } from "../lib/harness.mjs";
import { sleep, until } from "../lib/harness.mjs";
import { writeFileSync } from "node:fs";
const ctx = await openWalk("_t2explore");
const page = await ctx.page("admin");
const TID = process.env.TID;
const txt = async (n=1500) => (await bodyText(page, 20000)).replace(/\s+/g," ").slice(0,n);
try {
  await ctx.goto(page, `/data-v2/${TID}?view=grid&rail=import`);
  await sleep(7000);
  const main = await page.evaluate(()=>document.querySelector("main")?.innerText ?? document.body.innerText);
  console.log("IMPORT:", main.replace(/\s+/g," ").slice(0,1500));
  const inputs = await page.evaluate(()=>[...document.querySelectorAll("input[type=file]")].map(i=>({accept:i.accept, id:i.id, name:i.name})));
  console.log("FILEINPUTS", JSON.stringify(inputs));
  writeFileSync("/private/tmp/claude-501/sn/v.csv","Patient,Visit date,Minutes,Paid\nMateo Álvarez,2026-09-14,45,Yes\nSiobhán O'Neill,2026-09-15,30,No\n");
  await page.locator("input[type=file]").first().setInputFiles("/private/tmp/claude-501/sn/v.csv");
  await sleep(4000);
  await page.getByText("are added straight away").first().click();
  await page.getByRole("button",{name:/^Import 2 rows/}).first().click();
  await sleep(8000);
  console.log("IMPORTED:", (await page.evaluate(()=>document.querySelector("main")?.innerText ?? "")).replace(/\s+/g," ").slice(0,1200));
  await ctx.shot(page, "imported");
  console.log("URL", page.url());
  // table menu
  await page.getByRole("button",{name:"Table menu"}).first().click();
  await sleep(800);
  console.log("TABLE MENU:", JSON.stringify(await page.locator("[role=menuitem]").allInnerTexts()));
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"More actions"}).first().click();
  await sleep(800);
  console.log("MORE ACTIONS:", JSON.stringify(await page.locator("[role=menuitem]").allInnerTexts()));
  await ctx.shot(page, "moreactions");
  await page.keyboard.press("Escape");
  await page.locator("tbody tr").first().locator("td").nth(1).click();
  await sleep(500);
  await page.keyboard.press("Enter");
  await sleep(1500);
  console.log("URL2", page.url());
} finally { await ctx.finish(); }
