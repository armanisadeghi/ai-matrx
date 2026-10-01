import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-explore2");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/notes");
  await sleep(8000);
  await page.getByRole("button", { name: /^New Note$/ }).first().click();
  await sleep(6000);
  console.log(page.url());
  const btns = await page.evaluate(() => [...document.querySelectorAll("button,a[href],input,textarea,[contenteditable=true]")].filter(e=>e.offsetParent).map(e => e.tagName+" "+(e.getAttribute("aria-label")||e.title||e.placeholder||e.textContent||"").trim().slice(0,50)));
  console.log(btns.join("\n"));
  await ctx.shot(page, "newnote");
  await page.locator('[title="Set context for this note"]').first().click();
  await sleep(4000);
  await ctx.shot(page, "ctx");
  console.log((await bodyText(page, 6000)).replace(/\s+/g, " ").slice(-1500));
} finally { await ctx.finish(); }
