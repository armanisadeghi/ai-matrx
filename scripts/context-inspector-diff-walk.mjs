// LANE INSPECTOR-DIFF — headless proof on the shared preview of the context inspector's four
// result tabs (Diff, What the model gets today, Record store, Selection) on Castellano & Reyes,
// LLP → Clients → Meridian Risk Services → Contact Phone, at 1600 and 390 px. Read-only: every
// click is a selection or a tab.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/context-inspector-diff-walk.mjs <outDir> [firstShotNumber]
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.INSPECTOR_ORIGIN ?? "http://inspector-diff.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
let shot = Number(process.argv[3] ?? 28);
const first = shot;
mkdirSync(OUT, { recursive: true });
const PATH = "/administration/scopes-context/context-inspector";
const PICKS = ["Castellano & Reyes, LLP", "Clients", "Meridian Risk Services", "Contact Phone"];
const TABS = [
  ["diff", "diff"],
  ["today", "today"],
  ["store", "record-store"],
  ["selection", "selection"],
];

const browser = await chromium.launch({ headless: true });
const report = { origin: ORIGIN, consoleErrors: {}, tabs: {} };
let where = "sign-in";
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const listen = (p, label) => {
  p.on("response", (r) => {
    if (r.status() >= 400) (report.failedRequests ??= []).push({ at: label(), status: r.status(), url: r.url().slice(0, 200) });
  });
  p.on("console", (m) => { if (m.type() === "error") (report.consoleErrors[label()] ??= []).push(m.text().slice(0, 300)); });
  p.on("pageerror", (e) => (report.consoleErrors[label()] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
};
listen(page, () => where);
const columns = (p) => p.locator("[data-context-inspector] .min-w-\\[560px\\] > div");
const open = async (p, query = "") => {
  await p.goto(`${ORIGIN}${PATH}${query}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await p.waitForSelector("[data-context-inspector] button[aria-pressed]", { timeout: 240000 });
  const dismiss = p.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) await dismiss.click();
};
const readTab = (p, tab) => p.evaluate((t) => {
  const panel = document.querySelector("[data-compare-tabs]");
  const text = (sel) => [...document.querySelectorAll(sel)].map((el) => (el.textContent ?? "").trim().slice(0, 400));
  return {
    open: panel?.getAttribute("data-compare-tabs"),
    provenance: text("[data-provenance]"),
    fedVerdict: text("[data-fed-identical]"),
    fedBytes: text("[data-fed-bytes]"),
    fedMissing: text("[data-fed-missing]").length > 0,
    diffViewers: [...document.querySelectorAll("[data-diff-viewer]")].map((el) => el.getAttribute("data-diff-viewer")),
    valuesIdentical: text("[data-values-identical]"),
    activeBlock: (document.querySelector('[data-fed-block="active"] pre')?.textContent ?? "").slice(0, 600),
    arguments: document.querySelector('[data-selection-block="arguments"] pre')?.textContent ?? null,
    tab: t,
  };
}, tab);
const walkTabs = async (p, width) => {
  for (const [tab, name] of TABS) {
    where = `${width}-${tab}`;
    await p.locator(`[data-compare-tab="${tab}"]`).click();
    await until(`${tab} open`, async () => (await p.locator("[data-compare-tabs]").getAttribute("data-compare-tabs")) === tab, 30000);
    await p.waitForTimeout(700);
    report.tabs[`${width}-${tab}`] = await readTab(p, tab);
    await p.locator("[data-compare-tabs]").scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/${shot++}-diff-${name}-${width}.png`, fullPage: true });
  }
};
try {
  for (let attempt = 1; ; attempt++) {
    try {
      report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
      report.signInAttempts = attempt;
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
    }
  }
  where = "picks";
  await open(page);
  const answers = [];
  page.on("response", async (r) => {
    if (r.url().includes("/ai/context/preview") && !r.url().includes("answer-both") && r.request().method() === "POST") {
      const body = await r.json().catch(() => ({}));
      answers.push({
        status: r.status(),
        hasDelivered: Boolean(body.delivered),
        identical: body.delivered?.identical ?? null,
        provenance: body.provenance ?? null,
        selection: body.compare?.selection ?? null,
      });
    }
  });
  for (let i = 0; i < PICKS.length; i++) {
    const row = columns(page).nth(i).locator("button[aria-pressed]", { hasText: PICKS[i] }).first();
    await until(`${PICKS[i]} row`, async () => (await row.count()) > 0, 120000);
    await row.click();
  }
  await until("value", async () => (await page.locator("[data-inspector-value]").getAttribute("data-inspector-value").catch(() => null)) || null, 60000);
  await until("compare tabs", async () => (await page.locator("[data-compare-tabs]").count()) > 0, 180000);
  await page.waitForTimeout(1500);
  report.fullPath = new URL(page.url()).search;
  report.value = await page.locator("[data-inspector-value]").getAttribute("data-inspector-value");
  report.defaultTab = await page.locator("[data-compare-tabs]").getAttribute("data-compare-tabs");
  report.previewAnswersPerPick = answers.map((a) => ({ status: a.status, hasDelivered: a.hasDelivered, identical: a.identical, depth: a.selection?.depth ?? null }));
  report.lastProvenance = answers.at(-1)?.provenance ?? null;
  await walkTabs(page, 1600);

  where = "390";
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  const phone = await phoneCtx.newPage();
  listen(phone, () => where);
  await open(phone, report.fullPath);
  await until("compare tabs at 390", async () => (await phone.locator("[data-compare-tabs]").count()) > 0, 180000);
  await phone.waitForTimeout(1500);
  report.phoneDocScrollWidth = await phone.evaluate(() => document.documentElement.scrollWidth);
  await walkTabs(phone, 390);
} catch (error) {
  report.error = String(error).split("\n")[0].slice(0, 400);
  report.failedAt = where;
  await page.screenshot({ path: `${OUT}/${shot++}-diff-failure.png`, fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
  report.consoleErrorCount = Object.values(report.consoleErrors).reduce((n, list) => n + list.length, 0);
  writeFileSync(`${OUT}/${first}-diff-walk-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
