import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-explore7");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/chat/new");
  await sleep(9000);
  console.log("CHIPS", await page.evaluate(() => [...document.querySelectorAll("button[aria-label]")].filter(e=>e.offsetParent && /context/i.test(e.getAttribute("aria-label"))).map(e=>e.getAttribute("aria-label"))));
  await ctx.goto(page, "/notes");
  await sleep(8000);
  await page.getByRole("button", { name: /^New Note$/ }).first().click();
  await sleep(3000);
  await page.locator('textarea[aria-label="Note text"]').fill("Probe note zz two");
  await sleep(5000);
  await page.locator('[title="Set context for this note"]').first().click();
  await sleep(2500);
  await page.locator("button", { hasText: /^Patients/ }).first().click();
  await sleep(1500);
  await page.locator('[role=button]').filter({ hasText: "Dana Whitfield" }).locator("visible=true").first().click();
  await sleep(4000);
  await ctx.shot(page, "afterpick");
  console.log((await page.evaluate(() => document.body.innerText)).split("\n").filter(l=>/Dana|Whitfield|scope/i.test(l)).slice(0,10));
  console.log(page.url());
  const u = page.url();
  await ctx.goto(page, u);
  await sleep(9000);
  await ctx.shot(page, "reloaded");
  console.log("AFTER", (await page.evaluate(() => document.body.innerText)).split("\n").filter(l=>/Dana|Whitfield/i.test(l)).slice(0,10));
} finally { await ctx.finish(); }
