// LANE ORG-GATE-AUDIT (VERIFIER-20 #2) — headless proof on the shared preview: the owner's
// compare link opens and COMPARES with no organization picked in the shell, because the scope
// names its own organization. Read-only.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed), fresh
// cookie jar. Scope: admin's own "CONTEXT-PERF Bloomfield" (a55cb71e…, admin's Workspace).
// Usage: node scripts/org-gate-scope-compare-walk.mjs <outDir>
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.ORG_GATE_ORIGIN ?? "http://org-gate-audit.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
const SCOPE = process.env.ORG_GATE_SCOPE ?? "a55cb71e-2afb-4825-9570-a2c1c6ba02b8";

const browser = await chromium.launch({ headless: true });
const report = {};
try {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  const previews = [];
  page.on("request", (r) => {
    if (/\/ai\/context\/preview/.test(r.url()) && r.method() === "POST") previews.push({ org: r.headers()["x-organization-id"] ?? null });
  });
  await page.goto(`${ORIGIN}/administration/scopes-context/context-inspector?scope=${SCOPE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  report.shellHasNoOrganization = await page.getByText("Choose org").first().waitFor({ state: "visible", timeout: 120000 }).then(() => true).catch(() => false);
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)) await dismiss.click();
  const verdict = page.locator("[data-compare-summary], text=Comparison unavailable").first();
  await verdict.waitFor({ state: "visible", timeout: 180000 }).catch(() => undefined);
  await page.locator("[data-compare-organization]").first().scrollIntoViewIfNeeded().catch(() => undefined);
  await page.screenshot({ path: `${OUT}/scope-compare.png`, fullPage: false });
  report.comparedIn = await page.locator("[data-compare-organization]").first().textContent().catch(() => null);
  report.summary = (await page.locator("[data-compare-summary]").first().textContent().catch(() => null))?.slice(0, 200) ?? null;
  report.unavailable = await page.getByText("Comparison unavailable").isVisible().catch(() => false);
  report.pickerOpened = await page.getByText("Which workspace is this for?").isVisible().catch(() => false);
  report.previews = previews;
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
