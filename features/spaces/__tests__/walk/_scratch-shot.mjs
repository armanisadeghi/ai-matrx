// scratch: screenshot a page at a width (not committed)
import { open, shot, resumeIfPaused } from "./lib.mjs";
const [id, out, width = "1280", scrollTo = "0"] = process.argv.slice(2);
const { browser, page } = await open({ next: `/spaces/${id}`, width: Number(width), height: 1000 });
for (let i = 0; i < 40 && !(await page.locator(".bn-editor").first().isVisible().catch(() => false)); i++) { const r = page.getByRole("button", { name: /Resume/ }); if (await r.isVisible().catch(() => false)) { await r.click().catch(() => {}); } await page.waitForTimeout(5000); }
await page.locator(".bn-editor").first().waitFor({ timeout: 120000 }).catch(async () => { await page.screenshot({ path: out + ".fail.png" }); console.log("URL", page.url(), (await page.evaluate(() => document.body.innerText)).slice(0, 600)); });
await page.waitForTimeout(6000);
if (Number(scrollTo)) await page.evaluate((y) => { const s = document.querySelector(".spaces-scroll, [data-spaces-scroll]") ?? document.scrollingElement; s.scrollTop = y; }, Number(scrollTo));
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: false });
const info = await page.evaluate(() => [...document.querySelectorAll(".spaces-chart-title")].map((e) => ({ t: e.textContent, w: e.getBoundingClientRect().width })));
console.log(JSON.stringify(info));
await browser.close();
