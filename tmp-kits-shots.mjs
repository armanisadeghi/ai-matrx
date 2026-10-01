// temporary: screenshots of every kits screen (not committed)
import { chromium } from "playwright";
const [,, loginUrl, outDir, only] = process.argv;
const host = new URL(loginUrl).origin;
const routes = [
  ["gallery", "/kits"],
  ["detail-ai-model-picks", "/kits/ai-model-picks"],
  ["detail-ai-model-picks-org", "/kits/ai-model-picks?org_filter=884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"],
  ["detail-tag-library", "/kits/tag-library"],
  ["installed-ai-model-picks", "/kits/ai-model-picks/installed"],
  ["missing", "/kits/does-not-exist"],
];
const widths = [[1440, 900], [1024, 800], [375, 812]];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 120000 });
console.log("after login:", page.url());
async function shot(name, path, w, h, theme) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(host + path, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
  await page.waitForSelector("main h1, h1", { timeout: 90000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  await page.evaluate((t) => { const r = document.documentElement; r.classList.toggle("dark", t === "dark"); r.setAttribute("data-theme", t); r.style.colorScheme = t; }, theme);
  const tall = await page.evaluate(() => {
    let m = 0;
    document.querySelectorAll(".overflow-y-auto").forEach((el) => { if (el.clientHeight > 300) m = Math.max(m, el.scrollHeight - el.clientHeight); });
    return m;
  });
  if (tall > 0) { await page.setViewportSize({ width: w, height: Math.min(h + tall, 12000) }); await page.waitForTimeout(1200); }
  const file = `${outDir}/${name}-${w}-${theme}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
for (const theme of ["light", "dark"]) {
  for (const [w, h] of widths) {
    for (const [name, path] of routes) {
      if (only && !name.includes(only)) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await shot(name, path, w, h, theme); break; }
        catch (e) { console.error("retry", name, String(e.message).split("\n")[0]); await page.waitForTimeout(3000); }
      }
    }
  }
}
await browser.close();
