/**
 * REAL-DATA-2 — the proof shots. Headless, never the owner's screen.
 * Signed in as admin@admin.com through the dev-login nonce handshake, against
 * the shared dev server on 3001, showing the record store's own screens with
 * real-use-case data: businesses with names, people with mailboxes on their own
 * domains, no ZZZ, no Acme, no Job 001.
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:3001`;
const OUT = process.argv[process.argv.indexOf("--out") + 1];
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  ["01-your-tables", "/data-v2"],
  ["02-try-everything", "/data-v2/try-everything"],
  ["03-data-tables", "/data"],
  ["04-approvals", "/approvals"],
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const nonce = randomBytes(16).toString("hex");
writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent("/data-v2")}`, {
  waitUntil: "domcontentloaded", timeout: 180000,
});
const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
if (!who?.email) throw new Error("dev-login did not sign anyone in");
console.log(`[shots] signed in as ${who.email}`);
if (who.email !== "admin@admin.com") throw new Error(`wrong identity: ${who.email}`);

for (const [name, path] of SHOTS) {
  try {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(9000);
    const file = resolve(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    const text = (await page.evaluate(() => document.body.innerText || "")).slice(0, 400).replace(/\s+/g, " ");
    console.log(`[shots] ${name} -> ${file}\n         ${text}`);
  } catch (e) {
    console.log(`[shots] ${name} FAILED: ${String(e).slice(0, 200)}`);
  }
}
await browser.close();
