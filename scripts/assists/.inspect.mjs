import { chromium } from "playwright";
import { signIn, sleep, until } from "../lib/seat-browser.mjs";
const { WALK_ORIGIN: O, WALK_EMAIL: E, WALK_PASSWORD: P } = process.env;
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await signIn(page, O, E, P, "admin");
await page.goto(O + (process.env.P1 ?? "/agents/all"), { waitUntil: "domcontentloaded", timeout: 240000 });
await until("rows", async () => (await page.locator("[data-row-id]:visible").count()) > 0, 180000);
await sleep(4000);
console.log(JSON.stringify(await page.evaluate(() => {
  const footers = [...document.querySelectorAll('[data-matrx-table-footer], [data-assist-dock-slot="footer"]')].map((f) => { const r = f.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), nodes: f.querySelectorAll("*").length }; });
  const dock = [...document.querySelectorAll("[data-assists-dock]")].map((d) => { const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
  const box = document.querySelector("[data-assists-dock]")?.parentElement;
  return { footers, dock, boxStyle: box?.getAttribute("style"), slot: document.documentElement.getAttribute("data-assist-dock-slot"), headers: document.querySelectorAll("[data-header-right-set]").length, rootStyle: document.documentElement.getAttribute("style")?.slice(0, 300) };
})));
await b.close();
