import { chromium } from "playwright";
const [,, loginUrl, out, path, clickText] = process.argv;
const host = new URL(loginUrl).origin;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 120000 });
await page.goto(host + path, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
await page.waitForTimeout(4000);
if (clickText) for (const t of clickText.split("|")) { await page.getByText(t, { exact: false }).first().click().catch((e) => console.error("click", t, e.message.split("\n")[0])); await page.waitForTimeout(2500); }
await page.screenshot({ path: out });
await page.mouse.move(1140, 500); await page.mouse.wheel(0, 700); await page.waitForTimeout(1500);
await page.screenshot({ path: out.replace(".png", "-b.png") });
await page.mouse.wheel(0, 900); await page.waitForTimeout(1500);
await page.screenshot({ path: out.replace(".png", "-c.png") });
await browser.close();
