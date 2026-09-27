import { chromium } from "playwright";
import { readFileSync } from "node:fs";
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
let captured = null;
page.on("request", (r) => {
  if (r.url().includes("/rpc/") && r.method()==="POST" && !captured) {
    captured = r.headers();
  }
});
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3000);
  console.log(JSON.stringify(captured, null, 2));
} catch (e) { console.log("ERR", e.message); }
finally { await browser.close(); }
