import { openWalk, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-sweep");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/notes");
  await sleep(9000);
  for (let i = 0; i < 15; i++) {
    const opt = page.locator('button[aria-label^="Options for Shoulder rehab check-in notes"], button[aria-label^="Options for Probe note zz"]').first();
    if (!(await opt.count())) break;
    await opt.click({ force: true });
    await page.getByRole("menuitem", { name: /Move to Trash/ }).first().click();
    await page.getByRole("button", { name: /^Move to Trash$/ }).last().click();
    console.log("trashed one");
    await sleep(3500);
  }
} finally { await ctx.finish(); }
