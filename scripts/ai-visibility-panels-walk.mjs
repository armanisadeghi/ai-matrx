#!/usr/bin/env node
/**
 * ai-visibility-panels-walk — headless walk of the AI Visibility Panels page as the test admin:
 * the six metrics on an existing panel, the "Design a panel" form, starting a design, and the
 * Design section's step/notice view. Screenshots + walk.json to --out. Credentials come from
 * AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD (environment or .env.local) and are never printed.
 *
 *   node scripts/ai-visibility-panels-walk.mjs --base http://localhost:3001 \
 *     --panels-route /marketing/<brand>/seo/<site>/ai-visibility/panels --out <dir> [--start-design]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const base = arg("--base", "http://localhost:3001");
const route = arg("--panels-route");
const out = arg("--out", "/tmp/aiv-walk");
const startDesign = args.includes("--start-design");
fs.mkdirSync(out, { recursive: true });

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*(AI_ADMIN_USERNAME|AI_ADMIN_PASSWORD)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const user = process.env.AI_ADMIN_USERNAME || env.AI_ADMIN_USERNAME;
const pass = process.env.AI_ADMIN_PASSWORD || env.AI_ADMIN_PASSWORD;

const report = { steps: [], consoleErrors: [], failedRequests: [] };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("console", (m) => m.type() === "error" && report.consoleErrors.push(m.text().slice(0, 200)));
page.on("response", (r) => r.status() >= 400 && report.failedRequests.push(`${r.status()} ${r.url().replace(/\?.*$/, "").slice(0, 150)}`));
const shot = async (name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
const text = async () => (await page.locator("main").innerText().catch(() => "")) || "";

try {
  await page.goto(`${base}/login`, { timeout: 180000 });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', user);
  await page.fill('input[type="password"]', pass);
  await page.evaluate(() => document.querySelector("form")?.requestSubmit());
  await page.waitForFunction(() => !document.querySelector('input[type="email"]'), null, { timeout: 60000 });
  await page.goto(`${base}${route}`, { timeout: 300000 });
  await page.waitForTimeout(20000);
  const body = await page.locator("body").innerText();
  report.signedInAs = body.includes(user) ? user : "(identity text not found on page)";
  report.steps.push({ step: "panels_page", text: (await text()).slice(0, 4000) });
  await shot("1-panels");
  await page.getByRole("button", { name: "Design a panel" }).first().click();
  await page.waitForTimeout(2000);
  report.steps.push({ step: "design_form", text: (await text()).slice(0, 2000) });
  await shot("2-design-form");
  if (startDesign) {
    await page.getByRole("button", { name: "Start the design" }).click();
    await page.waitForTimeout(45000);
    report.steps.push({ step: "after_start", text: (await text()).slice(0, 5000) });
    await shot("3-after-start");
  }
} catch (e) {
  report.error = String(e).slice(0, 500);
  await shot("error").catch(() => {});
}
fs.writeFileSync(path.join(out, "walk.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ out, signedInAs: report.signedInAs, error: report.error ?? null, steps: report.steps.map((s) => s.step) }));
