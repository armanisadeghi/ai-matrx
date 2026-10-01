import { openWalk, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-sweep2");
try {
  const page = await ctx.page("admin");
  for (let i = 0; i < 4; i++) {
    await ctx.goto(page, "/projects");
    await sleep(8000);
    const link = page.locator('a[title^="Open Shoulder rehab outcomes review"]').first();
    if (!(await link.count())) break;
    const name = (await link.textContent()).trim();
    const href = await link.getAttribute("href");
    await ctx.goto(page, href + "/settings");
    await sleep(8000);
    await page.getByRole("button", { name: /^Delete$/ }).last().click();
    await page.locator('[role="dialog"] input, [role="alertdialog"] input').first().fill(name);
    await page.getByRole("button", { name: /^Delete Project$/ }).last().click();
    console.log("deleted", name);
    await sleep(6000);
  }
} finally { await ctx.finish(); }
