// scripts/safety-net/walks/_archive-fixtures.mjs — archive fixture tables a killed walk left behind,
// through the product (the table's Settings rail, "Archive this table", pressed twice), as admin.
//   SN_TARGET=live SN_ARCHIVE_IDS=<id>,<id> node scripts/safety-net/walks/_archive-fixtures.mjs
// Not a coverage check. Refuses Arman's table (the harness's goto does).
import { openWalk, until, sleep } from "../lib/harness.mjs";

const ids = (process.env.SN_ARCHIVE_IDS ?? "").split(",").filter(Boolean);
const ctx = await openWalk("_archive-fixtures");
try {
  const page = await ctx.page("admin");
  for (const id of ids) {
    await ctx.step([], `archive fixture ${id}`, page, async () => {
      await ctx.goto(page, `/data-v2/${id}?rail=settings`);
      await sleep(5000);
      if (await page.getByText("This table is archived").count()) return { ok: true, detail: "already archived" };
      // An archive a killed walk interrupted says so and offers "Carry on archiving" (it resumes).
      const carry = page.getByRole("button", { name: "Carry on archiving", exact: true });
      if (await carry.count()) {
        await carry.first().click();
        const resumed = await until("archived", async () => (await page.getByText("This table is archived").count()) > 0 || (await page.locator("[data-sonner-toast]").filter({ hasText: /archived/i }).count()) > 0, 180000);
        return { ok: Boolean(resumed.v), detail: resumed.v ? "an interrupted archive carried on and finished" : "Carry on archiving did not finish" };
      }
      const btn = page.getByRole("button", { name: "Archive this table", exact: true });
      const there = await until("Archive this table", async () => (await btn.count()) > 0, 60000);
      if (!there.v) return { ok: false, detail: "no Archive this table on its Settings rail (not a table, or not reachable)" };
      await btn.first().click();
      await sleep(1500);
      await btn.last().click();
      const done = await until("archived", async () => (await page.getByText("This table is archived").count()) > 0 || (await page.locator("[data-sonner-toast]").filter({ hasText: /archived/i }).count()) > 0, 120000);
      return { ok: Boolean(done.v), detail: done.v ? "archived" : "NOT archived" };
    });
  }
} finally {
  await ctx.finish();
}
