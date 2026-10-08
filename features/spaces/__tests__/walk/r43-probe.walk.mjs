import { open, originOf } from "./lib.mjs";
const { browser, page } = await open({ member: true, width: 1600, height: 1000 });
await page.goto(`${originOf(page)}/spaces`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(20000);
console.log(page.url());
await page.screenshot({ path: "/tmp/r43/s.png" });
await browser.close();
