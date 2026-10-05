import { sleep } from "./safety-net/lib/harness.mjs";
export async function go(ctx, page, path) {
  for (let i = 0; i < 4; i++) {
    try { await ctx.goto(page, path); } catch (e) { if (i === 3) throw e; await sleep(3000); continue; }
    for (let k = 0; k < 6; k++) {
      await sleep(1500);
      if (page.url().includes("__dev-walk")) {
        await page.getByRole("button", { name: /Resume/ }).first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 120000 }).catch(() => {});
      } else break;
    }
    if (!page.url().includes("__dev-walk")) return;
  }
}
export async function seat(ctx, name) {
  for (let i = 0; i < 4; i++) {
    try { return await ctx.page(name, { org: null, fresh: i > 0 }); } catch (e) { console.log("[seat] retry", name, String(e).slice(0, 100)); await sleep(5000); }
  }
  throw new Error("could not sign in " + name);
}
