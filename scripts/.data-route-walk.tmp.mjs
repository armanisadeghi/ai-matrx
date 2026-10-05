import { chromium } from "playwright";
import { signIn } from "./lib/seat-browser.mjs";
const O = "http://localhost:3001";
const SHOTS = process.env.SHOTS;
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));
const who = await signIn(page, O, process.env.E, process.env.P);
console.log("signed in as", who ? "admin seat ok" : "FAILED");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 1. Data home
await page.goto(O + "/data", { waitUntil: "domcontentloaded", timeout: 240000 });
await wait(15000);
console.log("home url", page.url(), "title", await page.title());
await page.screenshot({ path: SHOTS + "/1-home.png" });
// find a table link on the home
const tableHref = await page.evaluate(() => [...document.querySelectorAll("a[href^='/data/']")].map((a) => a.getAttribute("href")).find((h) => /^\/data\/[0-9a-f-]{36}$/.test(h)));
console.log("first table link on home", tableHref);
// any remaining data-v2 hrefs on the page?
console.log("data-v2 hrefs on home", await page.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /data-v2/.test(a.getAttribute("href") ?? "")).length));
// 2. a table
if (tableHref) {
  await page.goto(O + tableHref, { waitUntil: "domcontentloaded", timeout: 240000 });
  await wait(15000);
  console.log("table url", page.url(), "title", await page.title());
  await page.screenshot({ path: SHOTS + "/2-table.png" });
  const recordHref = await page.evaluate(() => [...document.querySelectorAll("a[href*='/r/']")].map((a) => a.getAttribute("href"))[0]);
  const rowId = recordHref ?? await page.evaluate(() => document.querySelector("[data-row-id]")?.getAttribute("data-row-id"));
  console.log("record link/row", rowId);
  const rec = recordHref ?? (rowId ? `${tableHref}/r/${rowId}` : null);
  if (rec) {
    await page.goto(O + rec, { waitUntil: "domcontentloaded", timeout: 240000 });
    await wait(12000);
    console.log("record url", page.url(), "title", await page.title());
    await page.screenshot({ path: SHOTS + "/3-record.png" });
  }
  // 4. old link redirect keeps query
  await page.goto(O + "/data-v2" + tableHref.slice(5) + "?view=dashboards", { waitUntil: "domcontentloaded", timeout: 240000 });
  await wait(8000);
  console.log("old link landed at", page.url());
}
// 5. sidebar link
await page.goto(O + "/dashboard", { waitUntil: "domcontentloaded", timeout: 240000 });
await wait(12000);
const navHrefs = await page.evaluate(() => [...document.querySelectorAll("nav a, aside a")].map((a) => `${a.textContent.trim().slice(0, 20)}=>${a.getAttribute("href")}`).filter((s) => /data/i.test(s)));
console.log("sidebar data links", JSON.stringify(navHrefs.slice(0, 10)));
// 6. Cmd+K
await page.keyboard.press("Meta+k");
await wait(2000);
await page.keyboard.type("Tables");
await wait(4000);
const cmd = await page.evaluate(() => {
  const d = document.querySelector("[cmdk-root], [role='dialog']");
  return d ? [...d.querySelectorAll("[cmdk-item], [role='option'], a")].map((e) => (e.textContent.trim().slice(0, 30) + " " + (e.getAttribute("href") ?? e.getAttribute("data-value") ?? "")).slice(0, 80)).slice(0, 8) : "no palette";
});
console.log("cmdk", JSON.stringify(cmd));
await page.screenshot({ path: SHOTS + "/4-cmdk.png" });
await page.keyboard.press("Enter");
await wait(10000);
console.log("cmdk Enter landed at", page.url());
console.log("page errors", JSON.stringify(errs.slice(0, 5)));
await b.close();
