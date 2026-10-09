// scripts/drill-usage-page-walk.mjs — lane DRILL-USAGE-PAGE, the owner-seat walk of the new usage
// explorer (/administration/usage) on the shared preview, as admin@admin.com signed in through the
// app's own login form (scripts/lib/seat-browser.mjs, headless). Live database, read-only except
// the page's own recount of the last hours (a derived rollup) and ONE Saved view it saves and
// archives again.
//
// Each of the old usage screens is ONE URL of the new page (the table in the walk note):
// every URL is opened, its total and groups read off the screen, and screenshotted; then the
// interactions — a click drills, the trail zooms out, Back undoes, the pivot, Copy CSV, the $
// switch, a Saved view saved/opened/archived, 390 px, dark.
//
//   ORIGIN=http://drillusage.localhost:3001 node scripts/drill-usage-page-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep, setOrganization } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillusage.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/tmp/matrx-evidence/2026-09-30/drill-usage-page";
mkdirSync(SHOTS, { recursive: true });
const readEnv = (p) =>
  Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
  );
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };

const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const WORKSPACE = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
export const SCREENS = [
  ["01-by-person", "Usage by person (today's Users › Usage page)", "?by=person&show=cost,requests,tokens_in,tokens_out&sort=-cost&w=30d"],
  ["02-one-person-by-day", "One person's usage, day by day (today only ?user= filtered)", `?f.person=${ADMIN}&by=at:day&show=cost,calls&w=30d`],
  ["03-by-organization", "Usage by organization (Spend Explorer › Organization)", "?by=organization&show=cost,people,requests&sort=-cost&w=30d"],
  ["04-one-org-by-person", "One organization, by person (the org console's column)", `?f.organization=${WORKSPACE}&by=person&show=cost,requests&sort=-cost&w=30d`],
  ["05-by-provider", "By provider (only cx-dashboard had it)", "?by=provider&show=cost,calls,tokens_in&sort=-cost&w=30d"],
  ["06-model-in-provider", "Models within one provider (cx-dashboard usage table)", "?f.provider=anthropic&by=model&show=cost,tokens_in,tokens_cached&sort=-cost&w=30d"],
  ["07-app-feature", "Where: app, then feature (Spend Explorer › App / Feature)", "?by=app,feature&show=cost,calls&sort=-cost&w=30d"],
  ["08-by-month-all-time", "Trend by month over all time (impossible today: 92-day cap)", "?by=at:month&show=cost,calls"],
  ["09-trigger-by-origin", "Manual vs automated, by origin (Spend trigger/origin, the origin mix bar)", "?by=trigger&across=origin&show=cost&w=30d"],
  ["10-person-by-month", "Person × month matrix", "?by=person&across=at:month&show=cost&sort=-cost&w=365d"],
  ["11-day-series", "Daily spend series (Spend day bars, cx-dashboard daily chart)", "?by=at:day&show=cost&w=30d"],
  ["12-provider-vs-previous", "Provider then model against the previous 90 days", "?by=provider,model&show=cost&sort=-cost&w=90d&cmp=prev"],
];

const out = { origin: ORIGIN, started: new Date().toISOString(), screens: [], steps: [], console_errors: [], frictions: [] };
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 400));
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") out.console_errors.push(m.text().slice(0, 300));
});
const doors = [];
page.on("response", async (r) => {
  if (!/\/rpc\/(drill_ask|drill_describe|ai_usage_names|ai_usage_recount|saved_view)/.test(r.url())) return;
  doors.push({ door: r.url().split("/rpc/")[1]?.split("?")[0], status: r.status() });
});

// The shared preview parks an idle tab ("This preview was paused … Resume this preview"): press
// Resume the way a person does, then carry on.
const resumeIfPaused = async () => {
  const resume = page.getByRole("button", { name: "Resume this preview" });
  if (await resume.count()) {
    step("the preview had parked this tab — pressed Resume");
    await resume.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 180000 }).catch(() => undefined);
    await sleep(3000);
  }
};
const origGoto = page.goto.bind(page);
page.goto = async (url, opts) => {
  const r = await origGoto(url, opts);
  await sleep(1500);
  await resumeIfPaused();
  return r;
};

const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
step("signed in", { who: who?.v ?? who });

const read = async () =>
  page.evaluate(() => ({
    total: document.querySelector("[data-usage-total]")?.textContent ?? null,
    groups: document.querySelectorAll('[data-matrx-drill-level="0"]').length,
    first: Array.from(document.querySelectorAll('[data-matrx-drill-level="0"] [data-matrx-drill-into]')).slice(0, 3).map((e) => e.textContent),
    trail: document.querySelector("[data-matrx-drill-trail], nav[aria-label*='rail']")?.textContent ?? null,
    bars: document.querySelectorAll("[data-matrx-drill-bar]").length,
    footer: document.querySelector("[data-matrx-drill-total]")?.textContent ?? null,
    error: document.querySelector("[data-matrx-drill-answer] [role='alert'], [data-matrx-drill-answer] .text-destructive")?.textContent ?? null,
    coverage: (document.querySelector("[data-matrx-drill-coverage]") ?? document.querySelector("[data-usage-coverage]"))?.textContent ?? null,
    note: document.querySelector("[data-matrx-drill-note]")?.textContent?.slice(0, 200) ?? null,
  }));
const settle = async () => {
  await until("answer", async () => {
    const r = await read();
    return (r.groups > 0 || r.error) && r.total && r.total !== "…";
  }, 90000);
  await sleep(800);
};

for (const [key, what, query] of SCREENS) {
  const t0 = Date.now();
  doors.length = 0;
  await page.goto(`${ORIGIN}/administration/usage${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await settle();
  const r = await read();
  const failed = doors.filter((d) => d.status >= 400);
  out.screens.push({ key, what, url: `/administration/usage${query}`, ms: Date.now() - t0, ...r, door_failures: failed });
  if (!r.groups) friction(`${key}: no groups drawn (${r.error ?? "no error shown"})`);
  if (failed.length) friction(`${key}: ${failed.length} door calls failed (${failed.map((f) => `${f.door} ${f.status}`).join(", ")})`);
  await page.screenshot({ path: `${SHOTS}/${key}.png`, fullPage: false });
  step(key, { ms: Date.now() - t0, total: r.total, groups: r.groups, first: r.first, bars: r.bars });
}

// INTERACTIONS on the first screen
await page.goto(`${ORIGIN}/administration/usage?by=organization&show=cost,calls&sort=-cost&w=30d`, { waitUntil: "domcontentloaded" });
await settle();
const firstOrg = page.locator('[data-matrx-drill-level="0"] [data-matrx-drill-into]').first();
const orgName = await firstOrg.textContent();
await firstOrg.click();
await until("drilled", async () => page.url().includes("f.organization="), 30000);
await settle();
let r = await read();
step("click a group drills (organization → person)", { url: page.url().replace(ORIGIN, ""), clicked: orgName, coverage: r.coverage, first: r.first });
if (!page.url().includes("by=person")) friction("the click did not regroup by the next level of the path (person)");
if (!r.coverage) friction("no coverage line on a narrowed answer");
await page.screenshot({ path: `${SHOTS}/20-drilled-with-coverage.png` });

// Copy CSV
if (await page.locator('[data-matrx-drill-export-action="csv"]').count()) {
  await page.locator('[data-matrx-drill-export-action="csv"]').click();
  await sleep(400);
  const csv = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
  step("Copy CSV", { lines: csv ? csv.split("\n").length : null, head: csv?.split("\n")[0] });
  if (!csv || !csv.includes("Total")) friction("Copy CSV put no grouped answer on the clipboard");
} else friction("no export controls drawn (the installed design-system predates the adoption)");

// $ switch
if (!(await page.locator('[data-usage-unit="usd"]').count())) friction("no $ switch offered to the admin");
else await page.locator('[data-usage-unit="usd"]').click();
await sleep(600);
r = await read();
step("the $ switch", { total: r.total });
if (!r.total?.includes("$")) friction("the $ switch did not show dollars");
await page.screenshot({ path: `${SHOTS}/21-dollars.png` });
if (await page.locator('[data-usage-unit="points"]').count()) await page.locator('[data-usage-unit="points"]').click();

// Back undoes the drill
await page.goBack();
await settle();
step("Back undoes one step", { url: page.url().replace(ORIGIN, "") });
if (page.url().includes("f.organization=")) friction("Back did not undo the drill");

// Saved view: save, reopen, archive
await page.goto(`${ORIGIN}/administration/usage?by=provider,model&show=cost&sort=-cost&w=90d`, { waitUntil: "domcontentloaded" });
await settle();
const viewName = `Provider and model spend, last 90 days (walk ${new Date().toISOString().slice(11, 16)})`;
await page.locator("[data-usage-saved-views]").click();
await sleep(500);
if (!(await page.locator("[data-usage-save-view]").count())) {
  // Saved views live in the organization the person works in; with none chosen the menu says so
  // and offers the picker (the held state) — pick one the way a person does.
  await page.screenshot({ path: `${SHOTS}/22a-saved-views-need-an-organization.png` });
  step("Saved views with no organization chosen: the menu holds and offers the picker");
  await page.keyboard.press("Escape");
  await setOrganization(page, "admin's Workspace");
  await page.goto(`${ORIGIN}/administration/usage?by=provider,model&show=cost&sort=-cost&w=90d`, { waitUntil: "domcontentloaded" });
  await settle();
  await page.locator("[data-usage-saved-views]").click();
  await sleep(500);
}
await page.locator("[data-usage-save-view]").click();
await page.getByRole("dialog").locator("input, textarea").first().fill(viewName);
await page.getByRole("button", { name: "Save view" }).click();
await sleep(1500);
await page.goto(`${ORIGIN}/administration/usage`, { waitUntil: "domcontentloaded" });
await settle();
await page.locator("[data-usage-saved-views]").click();
await sleep(800);
const item = page.locator("[data-usage-saved-view]", { hasText: viewName }).first();
const found = await item.count();
await page.screenshot({ path: `${SHOTS}/22-saved-views.png` });
if (found) {
  await item.locator("span").first().click();
  await until("opened", async () => page.url().includes("by=provider"), 20000);
  await settle();
  step("a Saved view opens its question", { url: page.url().replace(ORIGIN, "") });
  await page.locator("[data-usage-saved-views]").click();
  await sleep(500);
  await page.locator("[data-usage-saved-view]", { hasText: viewName }).first().getByRole("button", { name: /Archive/ }).click();
  await sleep(1200);
  step("the walk's Saved view archived");
} else friction("the saved view was not listed after saving");

// Pivot drawn
await page.goto(`${ORIGIN}/administration/usage?by=trigger&across=origin&show=cost&w=30d`, { waitUntil: "domcontentloaded" });
await settle();
const heads = await page.evaluate(() => Array.from(document.querySelectorAll("[data-matrx-drill-answer] thead th")).map((t) => t.textContent).slice(0, 12));
step("pivot columns", { heads });

// Old page link
await page.goto(`${ORIGIN}/administration/users/usage`, { waitUntil: "domcontentloaded" });
const link = await until("link", async () => (await page.locator("[data-usage-try-new]").count()) > 0, 60000);
step("old page offers 'Try the new usage page'", { present: Boolean(link.v) });
if (!link.v) friction("the old page has no link to the new one");
await page.screenshot({ path: `${SHOTS}/23-old-page-link.png` });

// 390 px + dark
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${ORIGIN}/administration/usage?by=provider&show=cost&w=30d`, { waitUntil: "domcontentloaded" });
await settle();
const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
step("390 px", { sideways_scroll: sideways });
if (sideways) friction("the page scrolls sideways at 390 px");
await page.screenshot({ path: `${SHOTS}/24-phone.png` });
await page.setViewportSize({ width: 1600, height: 1000 });
await page.emulateMedia({ colorScheme: "dark" });
await page.goto(`${ORIGIN}/administration/usage?by=at:day&show=cost&w=30d`, { waitUntil: "domcontentloaded" });
await settle();
await page.screenshot({ path: `${SHOTS}/25-dark.png` });

out.finished = new Date().toISOString();
writeFileSync(`${SHOTS}/walk.json`, JSON.stringify(out, null, 2));
console.log(`${out.screens.length} screens, ${out.frictions.length} frictions, ${out.console_errors.length} console errors`);
await browser.close();
