import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-explore8");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/projects");
  await sleep(9000);
  const row = page.locator("tr, [role=row]").filter({ hasText: "Shoulder rehab outcomes review" }).first();
  console.log(await row.innerHTML().then(h=>h.slice(0,1500)));
  const gear = row.locator("button, a").last();
  await gear.click();
  await sleep(8000);
  console.log(page.url());
  await ctx.shot(page, "settings");
  console.log(await page.evaluate(() => [...document.querySelectorAll("button,a")].filter(e=>e.offsetParent).map(e=>(e.getAttribute("aria-label")||e.textContent||"").trim().slice(0,40)).filter(Boolean).join(" | ")));
} finally { await ctx.finish(); }
