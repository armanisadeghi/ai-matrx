import { chromium } from "playwright";
const [,, loginUrl, outDir] = process.argv;
const base = new URL(loginUrl).origin;
const browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(loginUrl, { waitUntil: "commit", timeout: 400000 });
await page.waitForTimeout(10000);
for (const w of [1440, 390]) {
  await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
  if (w === 390) await page.goto(base + "/administration/intelligence/mandates", { waitUntil: "commit", timeout: 400000 });
  try { await page.waitForFunction(() => document.body && document.body.innerText.length > 3000, null, { timeout: 200000 }); } catch {}
  await page.waitForTimeout(20000);
  await page.screenshot({ path: `${outDir}/list2-${w}.png` });
  const info = await page.evaluate(() => ({ len: document.body.innerText.length,
    titles: [...new Set([...document.querySelectorAll("[title]")].map(e => e.title).filter(t => /Grad|Advance|declared|message alone|Hide results|output keys|Promises/.test(t)))].slice(0, 12) }));
  console.log(w, JSON.stringify(info));
}
await browser.close();
