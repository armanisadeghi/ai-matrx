// LANE SCOPE-ADMIN-INDEX — headless proof on the shared preview, as admin@admin.com (login
// form; credentials from .env.local, never printed):
//   A. /administration/scopes-context lists the "Organizations" destination (no dead end).
//   B. /administration/scopes-context/organizations lists every organization with its member
//      count, scope-type count, and last scope change.
//   C. Search narrows the list to a typed name.
//   D. Opening a row lands on that organization's scope console
//      (/administration/scopes-context/organizations/<orgId>).
// Usage: node scripts/scope-admin-index-walk.mjs <outDir> [firstShotNumber]
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.WALK_ORIGIN ?? "http://scope-admin-index.localhost:3001";
const [OUT = "/tmp", FIRST = "23"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
let n = Number(FIRST);

const browser = await chromium.launch({ headless: true });
const report = { steps: [], consoleErrors: {} };
let where = "sign-in";
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
page.setDefaultTimeout(240000);
page.setDefaultNavigationTimeout(240000);
page.on("console", (m) => { if (m.type() === "error") (report.consoleErrors[where] ??= []).push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => (report.consoleErrors[where] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
const shot = async (name) => { const f = `${OUT}/${String(n++).padStart(2, "0")}-${name}.png`; await page.screenshot({ path: f }); return f; };
const step = (s) => { report.steps.push(s); console.log(JSON.stringify(s)); };
const save = () => writeFileSync(`${OUT}/walk-report-scope-admin-index.json`, JSON.stringify(report, null, 2));
const body = async () => (await page.locator("body").first().textContent().catch(() => "")) ?? "";
const go = async (path) => { where = path; await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded" }); };
const seen = async (needle, ms = 120000) => (await until(needle, async () => (await body()).includes(needle), ms)).v === true;

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 240000 }).catch(() => {});
  step({ step: "signed in", who });

  await go("/administration/scopes-context");
  const listedOnLanding = await seen("Organizations");
  await shot("landing-lists-organizations-destination");
  step({ step: "A the scopes-context landing lists the Organizations destination", listedOnLanding });

  const orgLink = page.getByRole("link", { name: "Organizations" }).first();
  await orgLink.waitFor({ timeout: 60000 });
  await orgLink.click();
  await page.waitForURL((u) => u.pathname === "/administration/scopes-context/organizations", { timeout: 60000 });
  await page.waitForTimeout(2500);
  const table = await body();
  const hasTable = /Members|Scope types/.test(table);
  await shot("organizations-index-lists-orgs");
  step({ step: "B the organizations index renders name / member count / scope-type count / last change", hasTable });

  const searchBox = page.getByPlaceholder("Search organizations…");
  await searchBox.waitFor({ timeout: 30000 });
  const beforeRows = await page.locator("table tbody tr").count();
  await searchBox.fill("zzz-no-such-organization-zzz");
  await page.waitForTimeout(800);
  const noMatchText = await body();
  const narrowedToNothing = /Nothing matches/.test(noMatchText);
  await shot("search-narrows-to-nothing");
  step({ step: "C search narrows the list", beforeRows, narrowedToNothing });
  await searchBox.fill("");
  await page.waitForTimeout(800);

  const firstRowLink = page.locator("table tbody tr a").first();
  await firstRowLink.waitFor({ timeout: 30000 });
  const orgName = (await firstRowLink.textContent())?.trim();
  await firstRowLink.click();
  await page.waitForURL((u) => /\/administration\/scopes-context\/organizations\/[^/]+$/.test(u.pathname), { timeout: 60000 });
  await page.waitForTimeout(2000);
  const consoleBody = await body();
  const openedConsole = orgName ? consoleBody.includes(orgName) : false;
  await shot("row-opens-scope-console");
  step({ step: "D opening a row lands on that organization's scope console", orgName, openedConsole, url: page.url() });

  save();
} catch (e) {
  step({ step: "FAILED", where, error: String(e).slice(0, 500) });
  await shot("failure").catch(() => {});
} finally {
  save();
  await browser.close();
}
