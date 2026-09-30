// scripts/data-home/crash-probe.mjs — does /data-v2 crash for this seat? (lane DATA-HOME-2, 2026-09-29)
import { chromium } from "playwright";
import { setOrganization, signIn, until } from "../lib/seat-browser.mjs";
const ORIGIN = process.env.O ?? "https://www.aimatrx.com";
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && /RecordsProvider|useRecords/.test(m.text())) errs.push("console: " + m.text().slice(0, 300)); });
// The preview's walk cap parks an idle host; Resume it the way the walks do, before signing in.
if (!ORIGIN.includes("aimatrx.com")) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
  await page.evaluate(async () => {
    const body = new FormData();
    body.set("returnTo", "/login");
    return (await fetch("/__dev-walk", { method: "POST", body, redirect: "manual" })).status;
  }).catch(() => null);
  if (page.url().includes("__dev-walk")) await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await new Promise((r) => setTimeout(r, 6000));
}
const who = await signIn(page, ORIGIN, process.env.E, process.env.P);
const state = async () => page.evaluate(() => {
  const t = document.body.innerText;
  if (/RecordsProvider/.test(t)) return "CRASH: " + t.match(/.{0,120}RecordsProvider.{0,120}/s)?.[0];
  if (document.querySelector("[data-hub-root]")) return "home";
  if (/An organization is needed/.test(t)) return "needs-org";
  if (/Something went wrong|Application error/i.test(t)) return "ERROR: " + t.slice(0, 300);
  return null;
});
for (const path of ["/data-v2", "/data-v2?org=all", "/data-v2?scope=mine"]) {
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 180000 });
  let r = await until("state", state, 90000);
  if (r.v === "needs-org") { await setOrganization(page, process.env.W ?? "admin's Workspace"); await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded" }); r = await until("state", state, 90000); }
  console.log(who, path, "=>", r.v ?? "still loading after 90 s");
}
await page.screenshot({ path: process.env.SHOT });
console.log("page errors:", JSON.stringify(errs));
await b.close();
