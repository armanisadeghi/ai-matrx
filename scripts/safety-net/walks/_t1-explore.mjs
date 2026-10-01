// scratch exploration (SN-T1) — not committed
import { openWalk, bodyText, sleep, until, STAMP } from "../lib/harness.mjs";
import { writeFileSync } from "node:fs";
const ctx = await openWalk("_t1-explore");
const S = process.env.SCR;
const dump = async (page, f) => writeFileSync(`${S}/${f}`, await page.evaluate(() => [...document.querySelectorAll("[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper]")].map((d) => d.outerHTML.replace(/ class="[^"]*"/g, "")).join("\n\n")));
try {
  const page = await ctx.page("admin");
  let tid = process.env.TID;
  if (!tid) {
    await ctx.goto(page, "/data-v2");
    await sleep(5000);
    await page.getByRole("button", { name: /^New table/ }).first().click();
    await sleep(1200);
    await page.getByPlaceholder("Table name").fill(`Home Exercise Plans ${STAMP}`);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await until("the new table", async () => /\/data-v2\/[0-9a-f-]{36}/.test(page.url()), 90000);
    tid = page.url().match(/\/data-v2\/([0-9a-f-]{36})/)?.[1];
    console.log("TID", tid, page.url());
  } else await ctx.goto(page, `/data-v2/${tid}?view=sheet`);
  for (let k = 0; k < 12; k++) {
    await sleep(8000);
    if ((await page.locator("thead th").count()) > 1) break;
    const t = page.getByRole("button", { name: "Try again" });
    if (await t.count()) { console.log("try again", k); await t.first().click().catch(() => {}); }
  }
  await ctx.shot(page, "table");
  console.log("URL", page.url());
  console.log("buttons", JSON.stringify((await page.getByRole("button").allInnerTexts()).map((b) => b.trim().replace(/\s+/g," ")).filter(Boolean)));
  console.log("TH", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("thead th")].map((t) => t.innerText.trim()))));
  console.log("sheet?", await page.locator("[data-sheet-layout]").count());
  // the header … and the title chevron
  for (const [nm, loc] of [["dots", page.locator("header button, [data-shell-header] button").filter({ hasText: /^…$|^⋯$/ })], ["title", page.getByRole("button", { name: /Home Exercise Plans/ })]]) {
    if (await loc.count()) { await loc.first().click(); await sleep(1200); console.log("MENU", nm, JSON.stringify(await page.locator("[role=menu] [role^=menuitem]").allInnerTexts())); await dump(page, `menu-${nm}.html`); await page.keyboard.press("Escape"); await sleep(500); } else console.log("no", nm);
  }
  const col = page.getByRole("button", { name: /^Column$/ }).first();
  if (await col.count()) {
    await col.click(); await sleep(2000);
    await dump(page, "addcol.html");
    await ctx.shot(page, "addcol");
    const d = page.getByRole("dialog").first();
    const cbs = d.getByRole("combobox");
    console.log("combos", await cbs.count(), JSON.stringify(await cbs.allInnerTexts()));
    for (let i = 0; i < await cbs.count(); i++) {
      await cbs.nth(i).click(); await sleep(800);
      console.log("opts", i, JSON.stringify(await page.getByRole("option").allInnerTexts()));
      await page.keyboard.press("Escape"); await sleep(500);
    }
  }
} finally {
  await ctx.finish();
}
