// scripts/data-home/failed-requests-probe.mjs — every failed request and console error on /data-v2 for one seat.
import { chromium } from "playwright";
import { setOrganization, signIn, until } from "../lib/seat-browser.mjs";
const ORIGIN = process.env.O ?? "https://www.aimatrx.com";
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const failed = [];
const errors = [];
page.on("response", async (r) => {
  if (r.status() >= 400 && /supabase|matrxserver|\/rest\/v1|\/rpc\//.test(r.url())) {
    let body = "";
    try { body = (await r.text()).slice(0, 300); } catch {}
    let post = "";
    try { post = (r.request().postData() ?? "").slice(0, 300); } catch {}
    failed.push({ status: r.status(), url: r.url().replace(/\?.*/, ""), post, body });
  }
});
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e.message).slice(0, 300)));
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
for (const path of (process.env.PATHS ?? "/data-v2").split(",")) {
  failed.length = 0; errors.length = 0;
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 180000 });
  let r = await until("home", async () => page.evaluate(() => document.querySelector("[data-hub-root]") ? "home" : /An organization is needed/.test(document.body.innerText) ? "needs-org" : null), 120000);
  if (r.v === "needs-org") { await setOrganization(page, process.env.W ?? "admin's Workspace"); await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded" }); await until("home", async () => page.evaluate(() => !!document.querySelector("[data-hub-root]")), 120000); }
  await page.waitForTimeout(12000);
  const red = await page.evaluate(() => (document.body.innerText.match(/.{0,80}(door that took null|could not be read|did not answer).{0,120}/g) ?? []).slice(0, 5));
  console.log(JSON.stringify({ who, path, failed, errors: errors.slice(0, 8), red }, null, 1));
}
await b.close();
