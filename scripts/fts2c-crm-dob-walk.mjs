/** FTS-2c: a CRM person page adds, shows and saves a date of birth (crm.party column). Headless, :3001, admin@admin.com. */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { until, sleep } from "./lib/seat-browser.mjs";
const ORIGIN = process.env.WALK_ORIGIN ?? "http://fts2b.localhost:3001";
const OUT = "/tmp/matrx-evidence/fts2c"; mkdirSync(OUT, { recursive: true });
const PARTY = process.argv[2];
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const resume = async () => { if (page.url().includes("__dev-walk")) { await page.getByRole("button", { name: "Resume this preview" }).click(); await page.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180000 }); } };
const go = async (p) => { await page.goto(`${ORIGIN}${p}`, { waitUntil: "domcontentloaded", timeout: 180000 }); await resume(); };
await go("/login");
for (let n = 1; n <= 6; n++) { try { await resume(); await page.waitForSelector("#email", { timeout: 60000 }); await sleep(2000);
  await page.fill("#email", env.AI_ADMIN_USERNAME); await page.fill("#password", env.AI_ADMIN_PASSWORD); await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 }); await resume(); break; } catch (e) { console.log("sign-in try", n); await sleep(3000 * n); } }
await page.waitForLoadState("load").catch(() => {}); await sleep(5000);
const who = await page.evaluate(async () => (await (await fetch("/api/whoami")).json())?.email ?? null);
console.log("signed in as", who);
page.on("load", () => { if (page.url().includes("__dev-walk")) page.getByRole("button", { name: "Resume this preview" }).click().catch(() => {}); });
const errs = []; page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
try {
  await go(`/crm/${PARTY}`);
  await sleep(4000); await resume();
  await until("page", async () => (await page.getByText("Add details").count()) > 0, 90000);
  await page.screenshot({ path: `${OUT}/0-page.png` });
  await page.getByRole("button", { name: /Add details/ }).first().click({ timeout: 20000 });
  await page.getByRole("menuitem", { name: "Born" }).click();
  await page.keyboard.type("1984-03-27"); await page.keyboard.press("Enter");
  await sleep(3000); await page.screenshot({ path: `${OUT}/1-saved.png` });
  await go(`/crm/${PARTY}`);
  const seen = await until("dob", async () => (await page.locator("body").innerText()).includes("1984-03-27"), 60000);
  console.log("date of birth after reload:", !!seen.v);
  console.log("console errors mentioning confidential:", errs.filter((e) => /confidential/i.test(e)).length);
} finally { await browser.close(); }
