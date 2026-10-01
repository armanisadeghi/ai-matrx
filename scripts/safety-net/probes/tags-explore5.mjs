import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-explore5");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/notes");
  await sleep(8000);
  for (let i = 0; i < 12; i++) {
    const opt = page.locator('button[aria-label^="Options for Probe note"], button[aria-label="Options for New Note"]').first();
    if (!(await opt.count())) break;
    await opt.click({ force: true });
    await sleep(1000);
    if (i === 0) console.log(await page.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map(e=>e.textContent.trim())));
    const item = page.getByRole("menuitem", { name: /Trash|Delete/ }).first();
    await item.click();
    await sleep(1500);
    const conf = page.getByRole("button", { name: /Move to trash|Delete|Trash/i }).last();
    if (i === 0) await ctx.shot(page, "trash");
    console.log(await page.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button,[role=dialog] button")].map(e=>e.textContent.trim())));
    break;
  }
} finally { await ctx.finish(); }
