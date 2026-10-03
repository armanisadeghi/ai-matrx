// scripts/drill-adopt-walk.mjs — lane DRILL-ADOPT (program DRILL-FINISH, 2026-09-30).
//
// A headless, read-only walk as admin@admin.com (through the login form) of what the lane changed:
//   /administration/usage                     the chart above the answer (segment click drills, period
//                                             click narrows), the Pareto line, the window presets
//                                             (All time, Today, Yesterday, Custom range), a row's Copy,
//                                             Explain this (opened, nothing pressed inside), the unit
//                                             switch's word, the reconciliation line, 390 px + dark
//   /administration/knowledge/kg-cost         the OLD unit-economics section's numbers are on screen
//   /administration/automation/workflow-runs  (CLONE only) a run opens in its own window, never /workflows/runs
// Nothing is saved, pressed inside Alchemy, or written.
//
//   ORIGIN=http://drilladopt.localhost:3001 LABEL=live node scripts/drill-adopt-walk.mjs
//   ORIGIN=http://drilladopt.localhost:3001 LABEL=clone  # server in clone mode node scripts/drill-adopt-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drilladopt.localhost:3001";
const LABEL = process.env.LABEL ?? "live";
const SHOTS = process.env.SHOTS ?? "/tmp/matrx-evidence/2026-09-30/drill-adopt";
mkdirSync(SHOTS, { recursive: true });
const out = { label: LABEL, origin: ORIGIN, started: new Date().toISOString(), steps: [], console_errors: [], frictions: [] };
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 900));
};
const readEnv = (p) =>
  Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
  );
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 300)}`));
const shot = async (name, fullPage = false) => page.screenshot({ path: `${SHOTS}/${LABEL}-${name}.png`, fullPage });
const url = () => decodeURIComponent(page.url().replace(ORIGIN, ""));

async function gotoResuming(target) {
  for (let n = 1; n <= 8; n += 1) {
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 240000 });
    await sleep(1500);
    const parked = page.url().includes("__dev-walk") || (await page.getByRole("button", { name: /Resume/ }).count()) > 0;
    if (!parked) return;
    console.log(`[walk] parked by the walk cap (try ${n}) — resuming`);
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(5000 * n);
  }
  throw new Error("the walk cap kept parking this tab");
}
const groups = async () => page.locator("[data-matrx-drill-into]").count();
const noteText = async () => ((await page.locator("[data-drill-explorer-note]").first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
async function answered(label) {
  await sleep(500);
  return until(
    label,
    async () => {
      if ((await groups()) > 0) return "answered";
      const text = await page.locator("[data-drill-explorer]").first().textContent().catch(() => "");
      if (/could not|refus|cannot be|no table or definition/i.test(text ?? "")) return "said";
      return null;
    },
    180000,
  );
}
async function chartDrawn() {
  return until("chart bars", async () => ((await page.locator("[data-drill-explorer-chart] path.recharts-rectangle").count()) > 0 ? true : null), 120000).catch(() => false);
}

try {
  await gotoResuming(`${ORIGIN}/login`);
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  step("signed in", { who });
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);

  // 1. usage by provider, last 30 days: chart above the answer, Pareto, the unit word, the reconciliation
  await gotoResuming(`${ORIGIN}/administration/usage?by=provider&show=cost,requests&w=30d`);
  const a1 = await answered("usage by provider");
  const drawn = await chartDrawn();
  const chartBox = await page.locator("[data-drill-explorer-chart]").boundingBox().catch(() => null);
  const answerBox = await page.locator("[data-matrx-drill-answer]").first().boundingBox().catch(() => null);
  const legend = await page.locator("[data-matrx-drill-chart-series]").allTextContents().catch(() => []);
  const pareto = ((await page.locator("[data-matrx-drill-pareto]").first().textContent().catch(() => "")) ?? "").trim();
  const unitWords = await page.locator("[data-drill-explorer-unit]").allTextContents();
  const note1 = await noteText();
  step("usage by provider, 30 days", { outcome: a1.v ?? a1, chart: drawn, legend, chartAboveAnswer: chartBox && answerBox ? chartBox.y < answerBox.y : null, pareto, unitWords, note: note1 });
  await shot("01-usage-chart-pareto");
  if (!drawn) friction("the chart is not drawn above the answer");
  if (chartBox && answerBox && chartBox.y >= answerBox.y) friction("the chart is not above the answer");
  if (!/make \d+% of/.test(pareto)) friction("no Pareto sentence on the answer");
  if (unitWords.length > 0 && !unitWords.includes("Points")) friction(`the unit switch reads ${unitWords.join("/")}, not Points`);
  if (!/ledger|model call/i.test(note1)) step("no reconciliation words in the note (said or counted)", { note: note1 });

  // 2. a segment click drills into that provider
  const before2 = url();
  const seg = page.locator('[data-drill-explorer-chart] path.recharts-rectangle[fill="hsl(var(--matrx-chart-1))"]').first();
  const segBox = await seg.boundingBox().catch(() => null);
  if (segBox) {
    await page.mouse.click(segBox.x + segBox.width / 2, segBox.y + Math.max(2, segBox.height / 2));
    await sleep(2500);
  }
  const after2 = url();
  step("chart segment click drills", { before: before2, after: after2 });
  await answered("after segment click").catch(() => null);
  await shot("02-segment-drilled");
  if (!/f\.provider=/.test(after2)) friction("a segment click did not drill into its provider");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await answered("back").catch(() => null);
  await chartDrawn();

  // 3. a period click narrows the window to that day
  const bars = page.locator("[data-drill-explorer-chart] path.recharts-rectangle");
  const n = await bars.count();
  const col = await bars.nth(Math.max(0, Math.floor(n / 2))).boundingBox().catch(() => null);
  const plot = await page.locator("[data-drill-explorer-chart] .recharts-cartesian-grid").boundingBox().catch(() => null);
  if (col && plot) {
    await page.mouse.click(col.x + col.width / 2, plot.y + 8);
    await sleep(2500);
  }
  const after3 = url();
  step("chart period click narrows", { after: after3 });
  await answered("after period click").catch(() => null);
  await shot("03-period-narrowed");
  if (!/[?&]w=\d{4}-\d{2}-\d{2}/.test(after3)) friction("a period click did not narrow the window");

  // 4. the window presets
  await gotoResuming(`${ORIGIN}/administration/usage?by=provider&show=cost,requests&w=30d`);
  await answered("usage again");
  await page.locator("[data-matrx-drill-window]").first().click();
  await sleep(700);
  const options = (await page.locator("[data-matrx-drill-window-option]").allTextContents()).map((t) => t.trim());
  step("window presets", { options });
  await shot("04-window-presets");
  for (const want of ["All time", "Today", "Yesterday"]) if (!options.includes(want)) friction(`the window menu has no "${want}"`);
  if (!options.some((o) => /^Custom/.test(o))) friction("the window menu has no Custom range");
  await page.locator('[data-matrx-drill-window-option="yesterday"]').click().catch(() => {});
  await sleep(1500);
  const a4 = await answered("yesterday").catch(() => null);
  step("Yesterday chosen", { url: url(), outcome: a4?.v ?? a4 });
  await shot("05-yesterday");
  if (!/w=yesterday/.test(url())) friction("choosing Yesterday did not move the window");

  // 5. a row's Copy (text) — onto the clipboard, read back
  await gotoResuming(`${ORIGIN}/administration/usage?by=provider&show=cost,requests&w=30d`);
  await answered("usage for copy");
  const copyHtml = ((await page.locator("[data-matrx-drill-row-copy]").first().innerHTML().catch(() => "")) ?? "").slice(0, 600);
  const copyBtn = page.locator("[data-matrx-drill-row-copy] button").first();
  await copyBtn.hover().catch(() => {});
  await copyBtn.click().catch(() => {});
  await sleep(800);
  // the platform Copy control may open its menu (Copy / Copy for AI / Download): choose plain Copy
  const menuItems = (await page.locator('[role="menu"] [role="menuitem"], [data-radix-popper-content-wrapper] button').allTextContents().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  if (menuItems.length > 0) {
    const item = page.locator('[role="menu"] [role="menuitem"], [data-radix-popper-content-wrapper] button').filter({ hasText: /^Text$/ }).first();
    if ((await item.count()) > 0) await item.click().catch(() => {});
    await sleep(600);
  }
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `clipboard unreadable: ${e}`);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(300);
  step("row Copy", { copied: copied.slice(0, 300), menuItems, copyHtml: copyHtml.slice(0, 300) });
  if (!/Provider/i.test(copied)) friction("a row's Copy did not put the group's words on the clipboard");

  // 6. Explain this opens Alchemy on the question (nothing pressed inside)
  const posts = [];
  const onReq = (r) => ["POST", "PATCH", "PUT", "DELETE"].includes(r.method()) && !/drill_|rpc\/knob|feature_knob|ai_usage_names|saved_view|__nextjs|_next|webpack|hmr/.test(r.url()) && posts.push(`${r.method()} ${r.url().slice(0, 120)}`);
  page.on("request", onReq);
  await page.locator("[data-drill-explorer-explain]").first().click();
  await sleep(4000);
  const alchemy = ((await page.locator('[role="dialog"], [data-window-panel]').first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").slice(0, 300);
  step("Explain this opened", { alchemy, writes: posts });
  await shot("06-explain");
  page.off("request", onReq);
  if (!alchemy) friction("Explain this opened nothing");
  await page.keyboard.press("Escape").catch(() => {});

  // 7. 390 px and dark
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoResuming(`${ORIGIN}/administration/usage?by=provider&show=cost,requests&w=30d`);
  await answered("390");
  await chartDrawn();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  step("390 px", { sideways });
  await shot("07-390");
  if (sideways) friction("390 px scrolls sideways");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await sleep(800);
  await shot("08-390-dark");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot("09-1440-dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  // 8. KG dashboard: the OLD unit-economics section with its numbers
  await gotoResuming(`${ORIGIN}/administration/knowledge/kg-cost`);
  const kg = await until(
    "kg old section",
    async () => {
      const t = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
      return /Unit economics/i.test(t) && /Projected monthly/i.test(t) ? t : null;
    },
    180000,
  ).catch(() => null);
  const kgText = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
  const explorerMounted = (await page.locator("[data-kg-cost-explorer]").count()) > 0;
  const m = kgText.match(/Unit economics.{0,600}/i)?.[0] ?? "";
  step("KG dashboard: the old unit-economics section", { explorerMounted, section: m.slice(0, 600) });
  await page.getByText(/Unit economics/i).first().scrollIntoViewIfNeeded().catch(() => {});
  await shot("10-kg-old-section");
  if (!kg) friction("the KG dashboard's old unit-economics section is not on screen");
  if (explorerMounted) friction("the KG dashboard mounts the explorer before kg_cost is on production");
  if (/no table or definition called kg_cost/i.test(kgText)) friction("the KG dashboard shows the kg_cost refusal");

  // 9. (clone) workflow runs: a run opens in its own window
  if (LABEL === "clone") {
    await gotoResuming(`${ORIGIN}/administration/automation/workflow-runs?by=&w=7d`);
    const rec = await until("run records", async () => ((await page.locator("[data-drill-explorer-record-open]").count()) > 0 ? true : null), 180000).catch(() => false);
    const hrefs = await page.locator('a[href="/workflows/runs"]').count();
    step("workflow runs: records with a run door", { records: rec, linksToPersonalList: hrefs });
    await shot("11-workflow-run-records");
    if (!rec) friction("the workflow runs records do not list runs with a door");
    if (hrefs > 0) friction("the admin workflow-runs screen links to the personal runs list");
    if (rec) {
      const before = url();
      await page.locator("[data-drill-explorer-record-open]").first().click();
      await sleep(3500);
      const win = ((await page.locator("[data-window-panel], [role='dialog']").last().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").slice(0, 200);
      step("a run opened in its window", { stayed: url() === before, window: win });
      await shot("12-run-window");
      if (url() !== before) friction("opening a run left the admin page");
      if (!win) friction("opening a run opened no window");
    }
  }
} catch (e) {
  friction(`walk stopped: ${e instanceof Error ? e.message : String(e)}`);
  await shot("zz-stopped").catch(() => {});
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk-${LABEL}.json`, JSON.stringify(out, null, 2));
  console.log(`\n${out.frictions.length} frictions, ${out.console_errors.length} console errors → ${SHOTS}/walk-${LABEL}.json`);
  await browser.close();
}
