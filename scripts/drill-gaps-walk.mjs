// scripts/drill-gaps-walk.mjs — lane DRILL-GAPS (program DRILL-FINISH, 2026-09-30).
//
// A headless, read-only walk as admin@admin.com through the login form (screenshots + walk-<label>.json
// into the evidence folder (/tmp/matrx-evidence)) of what the lane changed on screen:
//   /administration/knowledge/kg-cost            the unit-economics section IS the explorer mount now:
//                                                header total + projection facts, source kinds in words,
//                                                cache-hit rate in %, the enrichment multiplier in ×
//   /administration/knowledge/kg-cost/explore    p90 and cost per 1,000 characters of successful runs;
//                                                the recent runs (records) with durations and costs in words
//   /administration/automation/workflow-runs     workflows named by the door (no ids), durations human, share in %
//   /workflows/runs/analyze                      the mine lane says "Your runs across all your organizations"
// Each screen: no id, no code, no "(ms)" / "(0 to 1)" label; 390 px without sideways scroll; dark.
//
//   ORIGIN=http://drillgaps.localhost:3001 LABEL=clone node scripts/drill-gaps-walk.mjs
//     the CLONE preview: the door and the definitions are rehearsed there, so the answers are real
//   ORIGIN=http://drillgaps.localhost:3001 LABEL=live node scripts/drill-gaps-walk.mjs
//     the LIVE preview: until the files are on production the mounts say the door's refusal
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep, setOrganization } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillgaps.localhost:3001";
const LABEL = process.env.LABEL ?? "clone";
const SHOTS = process.env.SHOTS ?? "/tmp/matrx-evidence/2026-09-30/drill-gaps";
mkdirSync(SHOTS, { recursive: true });
const out = { label: LABEL, origin: ORIGIN, started: new Date().toISOString(), steps: [], console_errors: [], frictions: [] };
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 700));
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
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 300)}`));
const shot = async (name) => page.screenshot({ path: `${SHOTS}/${LABEL}-${name}.png`, fullPage: false });

async function gotoResuming(url) {
  for (let n = 1; n <= 8; n += 1) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
    await sleep(1500);
    const parked = page.url().includes("__dev-walk") || (await page.getByRole("button", { name: /Resume/ }).count()) > 0;
    if (!parked) return;
    console.log(`[walk] parked by the walk cap (try ${n}) — resuming`);
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(5000 * n);
  }
  throw new Error("the walk cap kept parking this tab");
}

const total = async () => (await page.locator("[data-drill-explorer-total]").first().textContent().catch(() => null))?.trim() ?? null;
const groups = async () => page.locator("[data-matrx-drill-into]").count();
async function settledOrSaid(label, records = false) {
  await sleep(500);
  return until(
    label,
    async () => {
      if (records && (await page.locator("[data-drill-explorer-records] tbody tr").count()) > 0) return "records";
      if (!records && (await groups()) > 0 && !(await total())?.includes("…")) return "answered";
      const text = await page.locator("[data-drill-explorer]").first().textContent().catch(() => "");
      if (/could not|refus|cannot be|not allowed|permission|denied|not a table|no table or definition|no definition/i.test(text ?? "")) return "said";
      return null;
    },
    180000,
  );
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const CODE = /\b(save_hook|scrape_parsed_page|cld_file|awaiting_input|processed_document|source_intelligence|landed_only)\b/;
const UNIT_IN_LABEL = /\((ms|0 to 1)\)/;

async function read(scope = "[data-drill-explorer]") {
  const root = page.locator(scope).first();
  const labels = (await page.locator("[data-matrx-drill-into]").allTextContents()).map((t) => t.trim()).slice(0, 12);
  const headers = (await root.locator("th").allTextContents().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const cells = (await root.locator("td").allTextContents().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 80);
  const facts = (await page.locator("[data-drill-explorer-facts] li").allTextContents().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim());
  const note = (await page.locator("[data-drill-explorer-note]").first().textContent().catch(() => ""))?.replace(/\s+/g, " ").trim();
  return { total: await total(), labels, headers, cells, facts, note };
}
function judge(name, r) {
  if (r.labels.some((l) => UUID.test(l))) friction(`${name}: a group reads as an id`);
  if (r.labels.some((l) => CODE.test(l)) || r.cells.some((c) => CODE.test(c))) friction(`${name}: a code reaches the screen`);
  if (r.headers.some((h) => UNIT_IN_LABEL.test(h))) friction(`${name}: a unit is written into a column label`);
  if (r.cells.some((c) => UUID.test(c))) friction(`${name}: a cell reads as an id`);
}

try {
  await gotoResuming(`${ORIGIN}/login`);
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  step("signed in", { who });
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);

  // 1. the KG cost dashboard: the unit-economics section is the explorer mount
  await gotoResuming(`${ORIGIN}/administration/knowledge/kg-cost`);
  const mounted = await page.waitForSelector("[data-kg-cost-unit-economics] [data-kg-cost-explorer]", { timeout: 240000 }).then(() => true).catch(() => false);
  if (!mounted) friction("the KG cost dashboard does not mount the explorer in its unit-economics section");
  const r1 = await settledOrSaid("kg dashboard section");
  const d1 = await read("[data-kg-cost-unit-economics]");
  step("KG cost dashboard: unit economics through the explorer", { mounted, outcome: r1.v ?? r1, ...d1 });
  await page.locator("[data-kg-cost-unit-economics]").scrollIntoViewIfNeeded().catch(() => {});
  await shot("01-kg-dashboard-section");
  if ((r1.v ?? r1) === "answered") {
    judge("KG dashboard", d1);
    if (!d1.facts.some((f) => /Projected monthly cost/.test(f))) friction("the header does not say the monthly projection");
    if (!d1.cells.some((c) => /%$/.test(c))) friction("no cache-hit rate reads as a percent");
    if (!d1.cells.some((c) => /×$/.test(c))) step("no enrichment multiplier in this window (no enriched successful run)", {});
  }

  // 2. p90 and cost per 1,000 characters of successful runs (the old section's successful-run columns)
  await gotoResuming(`${ORIGIN}/administration/knowledge/kg-cost/explore?by=source_kind&show=runs,median_cost,p90_cost,max_cost,cost_per_1k_chars&f.status=success&w=90d`);
  const r2 = await settledOrSaid("kg explore p90");
  const d2 = await read();
  step("KG explore: p90 and cost per 1,000 characters, successful runs, 90 days", { outcome: r2.v ?? r2, url: page.url().replace(ORIGIN, ""), ...d2 });
  await shot("02-kg-p90-per-1k");
  if ((r2.v ?? r2) === "answered") {
    judge("KG p90", d2);
    if (!d2.headers.some((h) => /90th-percentile/.test(h))) friction("the p90 column is missing");
    if (!d2.headers.some((h) => /per 1,000 characters/.test(h))) friction("the cost per 1,000 characters column is missing");
  }

  // 3. the recent runs: records of an invoker definition, every cell in words
  await gotoResuming(`${ORIGIN}/administration/knowledge/kg-cost/explore?by=&w=7d`);
  const r3 = await settledOrSaid("kg records", true);
  const d3 = await read("[data-drill-explorer-records]");
  step("KG explore: the recent runs (records)", { outcome: r3.v ?? r3, url: page.url().replace(ORIGIN, ""), headers: d3.headers, cells: d3.cells.slice(0, 40) });
  await shot("03-kg-recent-runs");
  if ((r3.v ?? r3) === "records") judge("KG records", d3);
  else friction(`the recent runs did not draw (${r3.v ?? r3})`);

  // 4. workflow runs, platform lane: workflows named by the door, durations human, share in %
  await gotoResuming(`${ORIGIN}/administration/automation/workflow-runs?by=workflow&show=runs,failure_rate,duration_median,duration_max&w=30d`);
  const r4 = await settledOrSaid("workflow runs admin");
  await until("workflow names", async () => !(await page.locator("[data-matrx-drill-into]").allTextContents()).some((t) => t.includes("Reading the name")), 30000);
  const d4 = await read();
  step("Workflow runs (platform): names, durations, share", { outcome: r4.v ?? r4, ...d4 });
  await shot("04-workflow-runs-admin");
  if ((r4.v ?? r4) === "answered") {
    judge("workflow runs admin", d4);
    if (!d4.cells.some((c) => /^\d+(\.\d)?(ms|s)$|^\d+m \d\ds$|^\d+h \d\dm$/.test(c))) friction("no duration reads as a human duration");
    if (!d4.cells.some((c) => /%$/.test(c))) friction("the share that failed does not read as a percent");
  }

  // 5. the mine lane: every organization, said
  await gotoResuming(`${ORIGIN}/workflows/runs/analyze`);
  await sleep(1500);
  if ((await page.getByText("An organization is needed for run analysis").count()) > 0) {
    await setOrganization(page, process.env.WALK_ORG ?? "AI Matrx");
    step("chose an organization (the calendar)", { org: process.env.WALK_ORG ?? "AI Matrx" });
  }
  await page.waitForSelector('[data-workflow-runs-explorer="mine"]', { timeout: 240000 }).catch(() => friction("the Analyze mount never drew"));
  const r5 = await settledOrSaid("workflow runs mine");
  // (the fact's own separator "· " is drawn before it, aria-hidden)
  const scope = (await page.locator("[data-drill-explorer-scope]").first().textContent().catch(() => null))?.replace(/^·\s*/, "").trim() ?? null;
  const d5 = await read();
  step("Analyze (mine lane): the header says every organization", { outcome: r5.v ?? r5, scope, ...d5 });
  if (scope !== "Your runs across all your organizations") friction(`the mine lane's header says "${scope}"`);
  await shot("05-analyze-mine");
  if ((r5.v ?? r5) === "answered") judge("Analyze", d5);

  // 6. phone width and dark, on the KG dashboard
  await gotoResuming(`${ORIGIN}/administration/knowledge/kg-cost`);
  await page.waitForSelector("[data-kg-cost-unit-economics] [data-kg-cost-explorer]", { timeout: 240000 }).catch(() => {});
  await settledOrSaid("kg dashboard again");
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1000);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  step("390 px on the KG cost dashboard", { sideways });
  if (sideways) friction("the KG cost dashboard scrolls sideways at 390 px");
  await shot("06-kg-phone");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await sleep(600);
  await page.locator("[data-kg-cost-unit-economics]").scrollIntoViewIfNeeded().catch(() => {});
  await shot("07-kg-dark");
} catch (error) {
  friction(`walk stopped: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk-${LABEL}.json`, JSON.stringify(out, null, 2));
  console.log(`\n${out.frictions.length} friction(s), ${out.console_errors.length} console error(s) → ${SHOTS}/walk-${LABEL}.json`);
  await browser.close();
}
