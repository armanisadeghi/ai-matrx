import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const ROOT = process.cwd();
const HOST = "stagerules2.localhost";
const ORIGIN = `http://${HOST}:3000`;
const QUOTES = "0e108f31-5078-48ec-9a15-b492baa414ba";
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const nonce = randomBytes(16).toString("hex");
writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
await p.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/data-v2")}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForTimeout(6000);
const row = p.getByRole("option").filter({ hasText: "home-renovation" }).last();
if (await row.count()) { await row.click({ timeout: 20000 }).catch(()=>{}); await p.waitForTimeout(6000); }
await p.goto(`${ORIGIN}/data-v2/${QUOTES}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForTimeout(12000);
const info = await p.evaluate(() => ({
  buttons: Array.from(document.querySelectorAll("button")).map(b => (b.textContent||"").trim()).filter(Boolean).slice(0, 60),
  hasSection: document.body.innerText.includes("Rules for entering"),
  text: document.body.innerText.replace(/\s+/g," ").slice(0, 900),
}));
console.log(JSON.stringify(info, null, 1));
await b.close();
