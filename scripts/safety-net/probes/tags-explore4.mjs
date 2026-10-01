import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-explore4");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/notes");
  await sleep(8000);
  await page.getByRole("button", { name: /^New Note$/ }).first().click();
  await sleep(4000);
  await page.locator('textarea[aria-label="Note text"]').fill("Probe note zz body");
  await sleep(6000);
  console.log(page.url());
  await page.locator('[title="Set context for this note"]').first().click();
  await sleep(3000);
  await page.getByPlaceholder(/Search scopes/).fill("Patients");
  await sleep(3000);
  await ctx.shot(page, "search");
  const btns = await page.evaluate(() => [...document.querySelectorAll("button,input,[role=checkbox]")].filter(e=>e.offsetParent).map(e => e.tagName+" "+(e.getAttribute("aria-label")||e.placeholder||e.textContent||"").trim().slice(0,60)));
  console.log(btns.filter(b=>!/Expand|New Note in|New note in/.test(b)).join("\n"));
  await page.locator('[aria-label^="More"],[aria-label="Tab and note actions"]').first().click();
  await sleep(1500);
  await ctx.shot(page, "menu");
  console.log(await page.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map(e=>e.textContent.trim())));
} finally { await ctx.finish(); }
