/**
 * REAL-DATA-2 — the proof shots. Headless, never the owner's screen.
 * admin@admin.com through the dev-login nonce handshake, against the shared dev
 * server on 3001, on the record store's own screens with real-use-case data.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:3001`;
const OUT = process.argv[process.argv.indexOf("--out") + 1];
const BUSINESS = process.argv[process.argv.indexOf("--org") + 1];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const nonce = randomBytes(16).toString("hex");
writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/data-v2")}`, {
  waitUntil: "domcontentloaded", timeout: 180000,
});
let who = null;
for (let i = 0; i < 12 && who?.email !== "admin@admin.com"; i += 1) {
  await page.waitForTimeout(5000);
  who = await page.evaluate(async () => {
    try { const r = await fetch("/api/whoami"); const t = await r.text();
          return t.trim().startsWith("{") ? JSON.parse(t) : { raw: t.slice(0, 80) }; }
    catch (e) { return { err: String(e) }; }
  });
}
if (who?.email !== "admin@admin.com") throw new Error(`wrong identity: ${JSON.stringify(who)}`);
console.log(`[shots] signed in as ${who.email}`);

await page.waitForTimeout(6000);
const picked = page.getByText(BUSINESS, { exact: true }).first();
await picked.click({ timeout: 60000 });
console.log(`[shots] chose ${BUSINESS}`);
await page.waitForTimeout(12000);

const shots = [
  ["01-your-tables", "/data-v2"],
  ["03-data-tables", "/data"],
];
for (const [name, path] of shots) {
  try {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(12000);
    await page.screenshot({ path: resolve(OUT, `${name}.png`) });
    const t = (await page.evaluate(() => document.body.innerText || "")).replace(/\s+/g, " ");
    console.log(`[shots] ${name}: ${t.slice(0, 500)}`);
  } catch (e) { console.log(`[shots] ${name} FAILED ${String(e).slice(0,160)}`); }
}
await browser.close();
