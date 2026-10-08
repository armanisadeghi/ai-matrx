import { seat, T, sleep } from "./walk-fixes-2-lib.mjs";
const { browser, page, origin, errors, shot } = await seat(process.env.MEMBER === "1", `/data/${process.env.TID ?? T.tasks}`);
await page.waitForSelector('[role="grid"], table, [data-records-grid]', { timeout: 240000 }).catch(() => {});
await sleep(4000);
console.log("URL", page.url());
await shot(process.env.NAME ?? "probe");
console.log((await page.locator("body").innerText()).slice(0, 3000));
console.log("ERRORS", errors);
await browser.close();
