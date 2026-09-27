import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, sleep } from "./lib/seat-browser.mjs";
const ORIGIN = "https://www.aimatrx.com";
const env = Object.fromEntries(
  readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const TABLE = "31173dbe-04f5-4973-be03-2a41f0737142";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const reqs = [];
page.on("request", (r) => {
  const u = r.url();
  if ((u.includes("read_records_page") || u.includes("field_declare") || u.includes("record_update")) && r.method()==="POST") {
    reqs.push({ url: u, headers: r.headers(), body: r.postData() });
  }
});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  await page.getByRole("button", { name: "Sheet", exact: true }).click().catch(()=>{});
  await sleep(2000);
  console.log(JSON.stringify(reqs.map(r=>({url:r.url, body:r.body, apikeyHeader: r.headers['apikey']?.slice(0,10), authHeader: r.headers['authorization']?.slice(0,20)})), null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  await browser.close();
}
