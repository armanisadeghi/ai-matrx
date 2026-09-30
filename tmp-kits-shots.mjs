// temporary: screenshots of every kits screen (not committed)
import { chromium } from "playwright";
const [,, loginUrl, outDir, only] = process.argv;
const host = new URL(loginUrl).origin;
const routes = [
  ["gallery", "/kits"],
  ["detail-ai-model-picks", "/kits/ai-model-picks"],
  ["detail-tag-library", "/kits/tag-library"],
  ["detail-ai-model-picks-org", "/kits/ai-model-picks?org_filter=884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"],
  ["installed-ai-model-picks", "/kits/ai-model-picks/installed"],
  ["missing", "/kits/does-not-exist"],
];
const widths = [[1440, 900], [1024, 800], [375, 812]];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 120000 });
console.log("after login:", page.url());
const chooser = page.getByRole("button", { name: /Choose organization/i }).first();
if (await chooser.isVisible().catch(() => false)) {
  await chooser.click();
  await page.waitForTimeout(1000);
  await page.getByText("admin's Workspace", { exact: true }).first().click();
}
await page.waitForTimeout(2000);
for (const theme of ["light", "dark"]) {
  await ctx.addCookies([{ name: "theme", value: theme, url: host }]);
  for (const [w, h] of widths) {
    await page.setViewportSize({ width: w, height: h });
    for (const [name, path] of routes) {
      if (only && !name.includes(only)) continue;
      await page.goto(host + path, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.evaluate((t) => { const r = document.documentElement; r.classList.toggle("dark", t === "dark"); r.setAttribute("data-theme", t); r.style.colorScheme = t; }, theme);
      // the page scrolls inside an overflow-y-auto div: expand it for a full-page shot
      const tall = await page.evaluate(() => {
        let m = 0;
        document.querySelectorAll(".overflow-y-auto").forEach((el) => { if (el.clientHeight > 300) m = Math.max(m, el.scrollHeight - el.clientHeight); });
        return m;
      });
      if (tall > 0) { await page.setViewportSize({ width: w, height: Math.min(h + tall, 12000) }); await page.waitForTimeout(1200); }
      const file = `${outDir}/${name}-${w}-${theme}.png`;
      await page.screenshot({ path: file });
      await page.setViewportSize({ width: w, height: h });
      console.log(file);
    }
  }
}
await browser.close();
