import { chromium } from "playwright";
const [loginUrl, out] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 300000 });
  const btn = page.getByRole("button", { name: "Run 200 KB write" });
  try { await btn.waitFor({ timeout: 240000 }); } catch (e) { console.log("url", page.url()); await page.screenshot({ path: process.env.SHOT }); throw e; }
  await page.waitForTimeout(3000);
  await btn.click();
  const t0 = Date.now();
  for (;;) {
    const st = await page.evaluate(() => { const s = window.__surfaceWriteStress; return s ? { running: s.running, swapped: !!s.swappedAt, lt: s.longTasks.length, gap: s.worstFrameGapMs, mounted: s.diffMountedAt } : null; }).catch((e) => ({ err: String(e).slice(0, 80) }));
    if ((Date.now() - t0) % 10000 < 1600) console.log("poll", Math.round((Date.now() - t0) / 1000), JSON.stringify(st));
    if (st && st.swapped && st.running === false) break;
    if (Date.now() - t0 > 240000) { await page.screenshot({ path: process.env.SHOT }); throw new Error("stuck " + JSON.stringify(st)); }
    await page.waitForTimeout(1500);
  }
  const s = await page.evaluate(() => window.__surfaceWriteStress);
  console.log(JSON.stringify({ longTasksOver50ms: s.longTasks.length, worstLongTaskMs: Math.max(0, ...s.longTasks), worstFrameGapMs: s.worstFrameGapMs, diffMs: s.diffMountedAt && s.swappedAt ? Math.round(s.diffMountedAt - s.swappedAt) : null, diffUnmountsAfterMount: s.diffUnmountsAfterMount }));
  if (out) await page.screenshot({ path: out });
} finally {
  await browser.close();
}
