import { openWalk, bodyText, sleep, until } from "../lib/harness.mjs";
const ctx = await openWalk("_t2archive");
const page = await ctx.page("admin");
try {
  for (const tid of (process.env.IDS||"").split(",").filter(Boolean)) {
    await ctx.goto(page, `/data-v2/${tid}?rail=settings`);
    await sleep(7000);
    if (await page.getByText("This table is archived").count()) { console.log(tid, "already archived"); continue; }
    const btn = page.getByRole("button", { name: "Archive this table", exact: true });
    const there = await until("btn", async () => (await btn.count()) > 0, 60000);
    if (!there.v) { console.log(tid, "no archive button", (await bodyText(page,400)).replace(/\s+/g," ")); continue; }
    await btn.first().click(); await sleep(1500);
    await btn.last().click();
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: /archived/i });
    const done = await until("done", async () => (await toast.count()) > 0 || (await page.getByText("This table is archived").count()) > 0, 120000);
    console.log(tid, done.v ? "archived" : "NOT archived");
  }
} finally { await ctx.finish(); }
