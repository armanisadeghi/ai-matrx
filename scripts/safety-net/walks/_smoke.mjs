// Harness smoke: sign in, pick the fixture organization, open the data home. Not a coverage check.
import { openWalk, bodyText } from "../lib/harness.mjs";
const ctx = await openWalk("_smoke");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/data-v2");
  await page.waitForTimeout(8000);
  await ctx.step([], "data home opens", page, async () => {
    const t = await bodyText(page, 400);
    return { ok: /Tables|data/i.test(t), detail: t.replace(/\s+/g, " ").slice(0, 200) };
  });
} finally {
  await ctx.finish();
}
