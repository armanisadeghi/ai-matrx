// LANE GATES-TAIL (VERIFIER-21 #2) — headless proof on the shared preview: in a FRESH session
// (header "Choose org"), /files/f/<id> opens the file, and every request to the files service
// about it carries the FILE'S organization — never a 400 "Choose the organization".
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed). Read-only.
// Usage: node scripts/gates-tail-file-page-walk.mjs <outDir> [fileId...]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.GATES_TAIL_ORIGIN ?? "http://gates-tail.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
const FILES = process.argv.slice(3).length ? process.argv.slice(3) : ["503e2c1f-7b89-5908-891a-18ca0282fc04", "2bf14b50-0000-0000-0000-000000000000"];

const browser = await chromium.launch({ headless: true });
const report = [];
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: process.env.GT_SW ?? "allow" });
  const page = await context.newPage();
  console.log(`seat: ${await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin")}`);
  for (const id of FILES) {
    const calls = [];
    const onResp = async (r) => {
      const u = r.url();
      if (!u.includes(id) || /\/_next\/|\?_rsc=/.test(u)) return;
      calls.push({ method: r.request().method(), url: u.replace(/^https?:\/\/[^/]+/, ""), status: r.status(), org: r.request().headers()["x-organization-id"] ?? null });
    };
    context.on("response", onResp);
    const consoleErrors = [];
    const onConsole = (m) => { if (m.type() === "error" || m.type() === "warning") consoleErrors.push(m.text().slice(0, 200)); };
    page.on("console", onConsole);
    await page.goto(`${ORIGIN}/files/f/${id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForTimeout(12000);
    const text = await page.evaluate(() => document.body.innerText);
    const row = {
      id,
      headerChooseOrg: text.includes("Choose org"),
      refusedChooseOrg: /Choose the organization you/.test(text) || consoleErrors.some((e) => /Choose the organization/.test(e)),
      couldNotLoad: /Couldn.t load this file/.test(text),
      calls,
      consoleErrors: consoleErrors.slice(0, 6),
      bodyChars: text.length,
      errorLine: text.slice(Math.max(0, text.indexOf("load this file") - 40), text.indexOf("load this file") + 300),
    };
    report.push(row);
    await page.screenshot({ path: `${OUT}/file-page-${id.slice(0, 8)}-1600.png` });
    context.off("response", onResp);
    page.off("console", onConsole);
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
