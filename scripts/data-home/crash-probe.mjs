import { chromium } from "playwright";
import { signIn, until } from "../lib/seat-browser.mjs";
const ORIGIN = process.env.O ?? "https://www.aimatrx.com";
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error" && /RecordsProvider|useRecords/.test(m.text())) errs.push("console: " + m.text().slice(0, 200)); });
const who = await signIn(page, ORIGIN, process.env.E, process.env.P);
for (const path of ["/data-v2", "/data-v2?org=all", "/data-v2?scope=mine"]) {
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 180000 });
  const r = await until("home or error", async () => page.evaluate(() => document.querySelector("[data-hub-root]") ? "home" : /RecordsProvider|went wrong|Something went wrong|error/i.test(document.body.innerText) ? document.body.innerText.slice(0, 300) : null), 120000);
  console.log(who, path, "=>", JSON.stringify(r.v).slice(0, 300));
}
await page.screenshot({ path: process.env.SHOT });
console.log("errors:", JSON.stringify(errs));
await b.close();
