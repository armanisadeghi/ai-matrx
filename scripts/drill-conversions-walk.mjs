// scripts/drill-conversions-walk.mjs — lane DRILL-CONVERSIONS (program DRILL-FINISH, 2026-09-30).
//
// A headless, read-only walk of the three mounts of the one explorer, as admin@admin.com through the
// login form (screenshots + walk-<label>.json into the for-arman folder):
//   /administration/knowledge/kg-cost/explore   kg_cost, platform lane (+ the dashboard's Explore link)
//   /administration/automation/workflow-runs    workflow_runs, platform lane
//   /workflows/runs → Analyze → /workflows/runs/analyze   workflow_runs, mine lane (admin as a person)
// Each: the mount draws, the header total, the groups carry words (never ids or codes), one drill
// (a group clicked → its crumb in the address), 390 px without sideways scroll, dark.
//
//   ORIGIN=http://drillconv-clone.localhost:3002 LABEL=clone node scripts/drill-conversions-walk.mjs
//     the CLONE preview (the definitions are rehearsed there, so the answers are real)
//   ORIGIN=http://drillconv.localhost:3001 LABEL=live node scripts/drill-conversions-walk.mjs
//     the LIVE preview: until the definitions are on production the mounts say the door's refusal
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep, setOrganization } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillconv-clone.localhost:3002";
const LABEL = process.env.LABEL ?? "clone";
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-30/drill-conversions";
mkdirSync(SHOTS, { recursive: true });
const out = { label: LABEL, origin: ORIGIN, started: new Date().toISOString(), steps: [], console_errors: [], frictions: [] };
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 500));
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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
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
/** The mount has either drawn groups or said something (a refusal, an error) — never a forever wait. */
async function settledOrSaid(label) {
  await sleep(500);
  return until(
    label,
    async () => {
      if ((await groups()) > 0 && !(await total())?.includes("…")) return "answered";
      const text = await page.locator("[data-drill-explorer]").first().textContent().catch(() => "");
      if (/could not|refus|cannot|not allowed|permission|denied|not a table|no definition/i.test(text ?? "")) return "said";
      return null;
    },
    120000,
  );
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const CODE = /\b(save_hook|scrape_parsed_page|cld_file|awaiting_input|errored|processed_document)\b/;

async function walkMount({ name, path, mount, expectDrillKey }) {
  await gotoResuming(`${ORIGIN}${path}`);
  await page.waitForSelector(mount, { timeout: 180000 }).catch(() => friction(`${name}: the mount ${mount} never drew`));
  const r = await settledOrSaid(`${name} first screen`);
  // names are read after the numbers: wait (bounded) until no group still says it is reading
  await until(`${name} names`, async () => !(await page.locator("[data-matrx-drill-into]").allTextContents()).some((t) => t.includes("Reading the name")), 30000);
  const labels = (await page.locator("[data-matrx-drill-into]").allTextContents()).map((t) => t.trim()).slice(0, 12);
  const body = (await page.locator("[data-drill-explorer]").first().textContent().catch(() => ""))?.replace(/\s+/g, " ").slice(0, 600);
  step(`${name}: first screen`, { outcome: r.v ?? r, ms: r.ms, total: await total(), groups: await groups(), labels, body });
  await shot(`${name}-01-first`);
  if ((r.v ?? r) !== "answered") return;
  if (labels.some((l) => UUID.test(l))) friction(`${name}: a group reads as an id`);
  if (labels.some((l) => CODE.test(l))) friction(`${name}: a group reads as a code`);
  // drill the first group
  await page.locator("[data-matrx-drill-into]").first().click();
  const d = await settledOrSaid(`${name} drilled`);
  const url = page.url().replace(ORIGIN, "");
  step(`${name}: drilled the first group`, { url, total: await total(), groups: await groups(), outcome: d.v ?? d });
  if (!url.includes(`f.${expectDrillKey}=`)) friction(`${name}: the drill did not put f.${expectDrillKey} in the address (${url})`);
  await shot(`${name}-02-drilled`);
  await page.goBack();
  await settledOrSaid(`${name} back`);
  step(`${name}: Back`, { url: page.url().replace(ORIGIN, ""), total: await total() });
}

try {
  await gotoResuming(`${ORIGIN}/login`);
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  step("signed in", { who });
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);

  // the KG cost dashboard's door to the explorer
  await gotoResuming(`${ORIGIN}/administration/knowledge/kg-cost`);
  const exploreLink = await page.waitForSelector("[data-kg-cost-explore-link]", { timeout: 180000 }).then(() => true).catch(() => false);
  step("KG cost dashboard: Explore unit economics link", { exploreLink });
  if (!exploreLink) friction("the KG cost dashboard has no Explore link");
  else {
    await page.click("[data-kg-cost-explore-link]");
    await page.waitForURL(/kg-cost\/explore/, { timeout: 120000 }).catch(() => friction("the Explore link did not open the explorer"));
  }
  await walkMount({ name: "kg-cost", path: "/administration/knowledge/kg-cost/explore", mount: "[data-kg-cost-explorer]", expectDrillKey: "source_kind" });
  await walkMount({ name: "workflow-runs-admin", path: "/administration/automation/workflow-runs", mount: '[data-workflow-runs-explorer="platform"]', expectDrillKey: "workflow" });

  // the person's runs list → Analyze
  await gotoResuming(`${ORIGIN}/workflows/runs`);
  const analyze = await page.waitForSelector("[data-runs-analyze-link]", { timeout: 180000 }).then(() => true).catch(() => false);
  step("runs list: Analyze link beside the list", { analyze });
  if (!analyze) friction("the runs list has no Analyze link");
  else {
    await page.click("[data-runs-analyze-link]");
    await page.waitForURL(/runs\/analyze/, { timeout: 120000 }).catch(() => friction("Analyze did not open /workflows/runs/analyze"));
  }
  // The mine lane asks in the organization the person works in (its calendar); with none chosen the
  // page holds with the picker (the platform never picks one). Pick it the way a person does.
  await sleep(1500);
  const held = (await page.getByText("An organization is needed for run analysis").count()) > 0;
  step("Analyze with no organization chosen", { held });
  if (held) {
    await shot("workflow-runs-mine-00-held");
    await setOrganization(page, process.env.WALK_ORG ?? "AI Matrx");
    step("chose an organization", { org: process.env.WALK_ORG ?? "AI Matrx" });
  }
  await walkMount({ name: "workflow-runs-mine", path: "/workflows/runs/analyze", mount: '[data-workflow-runs-explorer="mine"]', expectDrillKey: "workflow" });

  // phone width and dark, on the person's page
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(800);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  step("390 px on /workflows/runs/analyze", { sideways });
  if (sideways) friction("the Analyze page scrolls sideways at 390 px");
  await shot("workflow-runs-mine-03-phone");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await sleep(500);
  await shot("workflow-runs-mine-04-dark");
} catch (error) {
  friction(`walk stopped: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk-${LABEL}.json`, JSON.stringify(out, null, 2));
  console.log(`\n${out.frictions.length} friction(s), ${out.console_errors.length} console error(s) → ${SHOTS}/walk-${LABEL}.json`);
  await browser.close();
}
