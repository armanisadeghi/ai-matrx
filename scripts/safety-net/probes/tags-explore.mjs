import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-explore");
const path = process.argv[2] ?? "/notes";
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, path);
  await sleep(10000);
  console.log(page.url());
  console.log((await bodyText(page, 3000)).replace(/\s+/g, " "));
  const btns = await page.evaluate(() => [...document.querySelectorAll("button,a[href]")].filter(e=>e.offsetParent).map(e => (e.getAttribute("aria-label")||e.title||e.textContent||"").trim().slice(0,50) + (e.tagName==="A"?" -> "+e.getAttribute("href"):"")).filter(Boolean));
  console.log(btns.join("\n"));
  await ctx.shot(page, "explore");
} finally { await ctx.finish(); }
