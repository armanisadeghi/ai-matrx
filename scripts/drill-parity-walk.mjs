// scripts/drill-parity-walk.mjs — lane DRILL-PARITY-LAST (program DRILL-FINISH, 2026-09-30).
//
// A headless, read-only walk as admin@admin.com (through the login form) on the CLONE preview, where
// the lane's door, view and definitions are rehearsed: "Usage by person" shows Total tokens and the
// latest active hour as a date (never a raw number); "Most expensive requests" shows Tool calls; a
// request's records carry its finish reason and tool calls. Nothing is saved, pressed or written.
//
//   ORIGIN=http://drillparity-clone.localhost:3002 node scripts/drill-parity-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillparity-clone.localhost:3002";
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-30/drill-parity";
mkdirSync(SHOTS, { recursive: true });
const out = { origin: ORIGIN, started: new Date().toISOString(), checks: [], console_errors: [], frictions: [] };
const readEnv = (p) => Object.fromEntries(readFileSync(p, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 300)}`));
const groups = () => page.locator("[data-matrx-drill-into]");
const answered = async () => {
  const r = await until("answer", async () => ((await groups().count()) > 0 ? "answered" : null), 240000).catch((e) => `timeout: ${e.message}`);
  return r?.v ?? r;
};
const headers = async () => (await page.locator("[data-matrx-drill-answer] thead th").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
const check = (name, ok, detail) => {
  out.checks.push({ name, ok, detail });
  if (!ok) out.frictions.push(`${name}: ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${String(detail).slice(0, 300)}`);
};

try {
  // the clone preview signs in through its own nonce (`pnpm dev-login --clone`, URL in DEV_LOGIN_URL);
  // otherwise through the login form
  if (process.env.DEV_LOGIN_URL) {
    await page.goto(process.env.DEV_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 240000 });
    await sleep(8000);
    out.who = "admin@admin.com (dev-login nonce)";
  } else {
    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
    if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);
    out.who = who;
  }

  // 1. Usage by person: Total tokens and Last active hour (a date, not a number)
  await page.goto(`${ORIGIN}/administration/usage?view=builtin:usage_by_person&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("usage by person answers", (await answered()) === "answered", page.url().replace(ORIGIN, ""));
  await sleep(4000);
  const h1 = await headers();
  check("usage by person shows Total tokens and Last active hour", h1.includes("Total tokens") && h1.includes("Last active hour"), h1.join(" | "));
  const firstRow = ((await page.locator('[data-matrx-drill-level="0"]').first().textContent()) ?? "").replace(/\s+/g, " ");
  check("the latest active hour reads as a date and time", /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{1,2}:\d{2}\s?(AM|PM)/.test(firstRow), firstRow.slice(0, 300));
  check("no raw epoch number on the row", !/\b1[78]\d{11}\b/.test(firstRow), firstRow.slice(0, 300));
  await page.screenshot({ path: `${SHOTS}/usage_by_person.png` });

  // 2. Most expensive requests: Tool calls
  await page.goto(`${ORIGIN}/administration/usage?def=ai_usage_executions&view=builtin:costliest_requests&w=7d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("most expensive requests answers", (await answered()) === "answered", page.url().replace(ORIGIN, ""));
  await sleep(4000);
  const h2 = await headers();
  check("most expensive requests shows Tool calls and Last active", h2.includes("Tool calls") && h2.includes("Last active"), h2.join(" | "));
  await page.screenshot({ path: `${SHOTS}/costliest_requests.png` });

  // 3. A request's records: finish reason and tool calls columns (the row menu's "See these records")
  const menu = page.locator('[data-matrx-drill-level="0"]').first().locator("[data-matrx-drill-menu]");
  await menu.click();
  await page.locator('[data-matrx-drill-action="records"]').click();
  await sleep(12000);
  const recordHeads = (await page.locator("th").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
  check("a request's records carry its finish reason and tool calls", recordHeads.some((t) => /finish reason/i.test(t)) && recordHeads.some((t) => /tool calls/i.test(t)), recordHeads.filter(Boolean).slice(0, 30).join(" | "));
  await page.screenshot({ path: `${SHOTS}/request_records.png` });
} catch (e) {
  out.frictions.push(`walk stopped: ${e.message}`);
  console.log("walk stopped:", e.message);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk-clone.json`, JSON.stringify(out, null, 2));
  await browser.close();
}
console.log(`frictions ${out.frictions.length}, console errors ${out.console_errors.length}`);
