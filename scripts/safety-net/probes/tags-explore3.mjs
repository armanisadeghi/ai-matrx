import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-explore3");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/chat/new");
  await sleep(9000);
  await page.mouse.click(565,604);
  await sleep(3000);
  await ctx.shot(page, "chip");
  const btns = await page.evaluate(() => [...document.querySelectorAll("[data-radix-popper-content-wrapper] *")].filter(e=>e.offsetParent && /BUTTON|INPUT|A/.test(e.tagName)).map(e => e.tagName+" "+(e.getAttribute("aria-label")||e.placeholder||e.textContent||"").trim().slice(0,50)));
  console.log(btns.join("\n"));
} finally { await ctx.finish(); }
