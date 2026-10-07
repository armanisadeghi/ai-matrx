import { open } from "./lib.mjs";
const [next, shotPath] = process.argv.slice(2);
const { browser, page } = await open({ next });
await page.waitForTimeout(25000);
await page.screenshot({ path: shotPath });
console.log("url:", page.url());
const names = await page.locator("button, [role=tab], a").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim()).filter(Boolean).slice(0, 120));
console.log(names.join(" | "));
await browser.close();
