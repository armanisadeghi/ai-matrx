// LANE CONTEXT-INSPECTOR-3 — headless proof on the shared preview that the context inspector's
// steps are the platform's Miller Columns (not hand-rolled pickers): Castellano & Reyes, LLP →
// Clients → Meridian Risk Services → Contact Phone = (619) 555-0177 with the compare following
// every pick; a long column's own search box narrows that column; an old `?scope=<id>` link
// back-fills three columns; and the other Miller Columns / lens-chip hosts still open (the chat
// header's lens chip, the Miller popover and the Context Switcher window). Read-only: every
// click is a selection (no commit / assign / create button is pressed).
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/context-inspector-miller-walk.mjs <outDir> [firstShotNumber]
//   INSPECTOR_BACKEND=http://localhost:8000 routes the compare's server calls (/ai/context/preview*)
//   to a local aidream checkout — how an unreleased server contract is walked before the train.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.INSPECTOR_ORIGIN ?? "http://context-inspector.localhost:3001";
const PROD = (env.NEXT_PUBLIC_BACKEND_URL_PROD ?? "https://server.app.matrxserver.com").replace(/\/$/, "");
const BACKEND = process.env.INSPECTOR_BACKEND?.replace(/\/$/, "") ?? null;
const OUT = process.argv[2] ?? "/tmp";
let shot = Number(process.argv[3] ?? 1);
mkdirSync(OUT, { recursive: true });
const PATH = "/administration/scopes-context/context-inspector";
const PATH_PICKS = [
  { column: 1, label: "Castellano & Reyes, LLP", step: "org" },
  { column: 2, label: "Clients", step: "scopeType" },
  { column: 3, label: "Meridian Risk Services", step: "scope" },
  { column: 4, label: "Contact Phone", step: "item" },
];

const browser = await chromium.launch({ headless: true });
const report = { backend: BACKEND ?? PROD, steps: [], consoleErrors: {}, hosts: {} };
let page = null;
let where = "sign-in";
try {
  page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  page.on("console", (m) => {
    if (m.type() === "error") (report.consoleErrors[where] ??= []).push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => (report.consoleErrors[where] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
  if (BACKEND) {
    await page.route(`${PROD}/ai/context/preview**`, async (route) => {
      const response = await route.fetch({ url: route.request().url().replace(PROD, BACKEND) });
      await route.fulfill({ response });
    });
  }
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");

  // ── 1. The inspector: four picks down the columns. ──
  where = "inspector";
  await page.goto(`${ORIGIN}${PATH}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-context-inspector]", { timeout: 240000 });
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) await dismiss.click();
  report.handRolledPickers = await page.locator("[data-inspector-step], [data-context-inspector] [role=combobox]").count();

  const column = (n) => page.locator("[data-context-inspector] .min-w-\\[560px\\] > div").nth(n - 1);
  const row = (n, label) => column(n).locator("button[aria-pressed]", { hasText: label }).first();
  const compareText = () => page.evaluate(() =>
    [...document.querySelectorAll("[data-compare-side]")].map((el) => el.textContent ?? "").join("\n---\n"));
  let previous = "";
  for (const p of PATH_PICKS) {
    await until(`${p.label} row`, async () => (await row(p.column, p.label).count()) > 0, 120000);
    await row(p.column, p.label).click();
    const { v: text, ms } = await until(`${p.step} preview`, async () => {
      if (await page.locator("text=Comparison unavailable").count()) return "error";
      if ((await page.locator("[data-compare-side]").count()) < 2) return null;
      const now = await compareText();
      return p.step === "item" || now !== previous ? now : null;
    }, 180000);
    report.steps.push({
      step: p.step,
      picked: p.label,
      url: page.url().replace(ORIGIN, ""),
      pressed: await page.locator('[data-context-inspector] button[aria-pressed="true"]').allInnerTexts(),
      previewMs: ms,
      previewChanged: text !== "error" && text !== previous,
      caption: await page.locator("[data-inspector-caption]").first().innerText().catch(() => null),
      value: await page.locator("[data-inspector-value]").getAttribute("data-inspector-value").catch(() => null),
    });
    await page.screenshot({ path: `${OUT}/${shot++}-miller-${p.step}.png`, fullPage: true });
    previous = text;
  }

  // ── 2. A long column searches itself. Find a scope column with more than 8 rows. ──
  where = "column-search";
  const orgRows = column(1).locator("button[aria-pressed]");
  let found = null;
  for (let o = 0; o < (await orgRows.count()) && !found; o++) {
    await orgRows.nth(o).click();
    await page.waitForTimeout(300);
    const typeRows = column(2).locator("button[aria-pressed]");
    for (let t = 0; t < (await typeRows.count()) && !found; t++) {
      await typeRows.nth(t).click();
      await page.waitForTimeout(300);
      if ((await column(3).locator('input[data-column-search]').count()) > 0) {
        found = {
          org: await orgRows.nth(o).innerText(),
          type: await typeRows.nth(t).innerText(),
        };
      }
    }
  }
  // No scope type in this seat's tree may have more than 8 scopes; then the proof is the
  // longest column that does (the same Column + search code path), said so in the report.
  const searchColumn = found ? 3 : 1;
  if (!found) {
    await page.goto(`${ORIGIN}${PATH}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForSelector("[data-context-inspector] button[aria-pressed]", { timeout: 240000 });
  }
  const colRows = column(searchColumn).locator("button[aria-pressed]");
  const before = await colRows.allInnerTexts();
  const target = found ? before[Math.floor(before.length / 2)] : "Castellano & Reyes, LLP";
  const query = target.split(/\s+/)[0].slice(0, 6);
  const box = column(searchColumn).locator('input[data-column-search]');
  await box.fill(query);
  const { v: after } = await until("column narrowed", async () => {
    const now = await colRows.allInnerTexts();
    return now.length < before.length ? now : null;
  }, 15000);
  report.columnSearch = {
    column: found ? `Scopes (${found.org} > ${found.type})` : "Organizations — no scope column in this seat's tree has more than 8 rows",
    searchBox: await box.getAttribute("aria-label"),
    query,
    before: before.length,
    after: after.length,
    afterRows: after.slice(0, 10),
    everyRowMatches: after.every((r) => r.toLowerCase().includes(query.toLowerCase())),
    searchBoxesPerColumn: await Promise.all([1, 2, 3, 4].map((n) => column(n).locator('input[data-column-search]').count())),
  };
  if (!found) {
    // Narrowed, then picked from the narrowed column: the pick still drives the address.
    await colRows.filter({ hasText: target }).first().click();
    report.columnSearch.pickedFromNarrowed = page.url().replace(ORIGIN, "");
  }
  await page.screenshot({ path: `${OUT}/${shot++}-miller-column-search.png`, fullPage: true });

  // ── 3. An old shared link: only ?scope=. The tree names its organization and type. ──
  where = "deep-link";
  await page.goto(`${ORIGIN}${PATH}?scope=2ba5cb52-9530-4682-a12c-3ededff23c2c`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const { v: filled } = await until("deep link back-fill", async () => {
    const u = new URL(page.url());
    return u.searchParams.get("org") && u.searchParams.get("scopeType") && (await page.locator("[data-compare-side]").count()) >= 2
      ? u.search : null;
  }, 180000);
  report.deepLink = {
    url: filled,
    pressed: await page.locator('[data-context-inspector] button[aria-pressed="true"]').allInnerTexts(),
  };
  await page.screenshot({ path: `${OUT}/${shot++}-miller-deep-link.png`, fullPage: true });

  // ── 4. Other hosts: the chat header's lens chip (ActiveContextTree). ──
  where = "chat-lens-chip";
  await page.goto(`${ORIGIN}/chat`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const chip = page.locator("button.rounded-full:has(svg.lucide-chevrons-up-down)").first();
  await until("lens chip", async () => (await chip.count()) > 0 && (await chip.isVisible()), 120000);
  report.hosts.lensChip = { label: await chip.innerText() };
  await chip.click();
  await until("context tree", async () => (await page.getByLabel("Search context tree").count()) > 0, 30000);
  report.hosts.lensChip.treeSearch = await page.getByLabel("Search context tree").count();
  await until("tree rows", async () =>
    ((await page.locator('[role="tree"]').first().innerText().catch(() => "")) ?? "").trim().length > 10, 60000);
  report.hosts.lensChip.treeText = (await page.locator('[role="tree"]').first().innerText()).split("\n").slice(0, 6);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${shot++}-chat-lens-chip.png`, fullPage: false });
  await page.keyboard.press("Escape");

  // ── 5. The Miller popover (condensed) and the Context Switcher window (full). ──
  where = "miller-hosts";
  await page.goto(`${ORIGIN}/administration/ui/official-components/miller-columns-context-picker`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const selectContext = page.getByRole("button", { name: "Select context" }).first();
  await until("popover trigger", async () => (await selectContext.count()) > 0, 120000);
  await selectContext.click();
  await until("popover columns", async () => (await page.locator("[data-radix-popper-content-wrapper] button[aria-pressed]").count()) > 0, 30000);
  report.hosts.popover = {
    rows: await page.locator("[data-radix-popper-content-wrapper] button[aria-pressed]").count(),
    searchBoxes: await page.locator('[data-radix-popper-content-wrapper] input[data-column-search]').count(),
  };
  await page.screenshot({ path: `${OUT}/${shot++}-miller-popover.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open full WindowPanel" }).click();
  const win = page.locator('[data-overlay-id="contextSwitcherWindow"], [role="dialog"]').filter({ hasText: "Working Context" }).first();
  const title = page.getByText("Working Context", { exact: true }).first();
  await until("context switcher window", async () => (await title.count()) > 0 && (await title.isVisible()), 60000);
  // The full variant inside the window carries the Projects / Tasks row; wait for its columns.
  await until("window columns", async () => (await page.getByText("Projects", { exact: true }).count()) > 0, 60000);
  await page.waitForTimeout(600);
  report.hosts.contextSwitcher = {
    title: await title.innerText(),
    windowFound: await win.count(),
    projectsColumn: await page.getByText("Projects", { exact: true }).count(),
  };
  await page.screenshot({ path: `${OUT}/${shot++}-context-switcher-window.png`, fullPage: false });
} catch (error) {
  if (page) await page.screenshot({ path: `${OUT}/walk-failure.png`, fullPage: true }).catch(() => undefined);
  report.failure = `${where}: ${String(error).slice(0, 600)}`;
  process.exitCode = 1;
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
