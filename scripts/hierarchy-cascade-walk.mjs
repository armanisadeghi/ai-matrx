// LANE HIERARCHY-CASCADE — headless proof on the shared preview that the retired bespoke pickers'
// call sites now run the canonical scope selection family:
//   1. an agent app's settings (EntityEngagementPicker): pick project → task, tag a scope, reload,
//      see it persist, undo (admin@admin.com's own app "Smart City Discovery Guide");
//   2. the research start form (EngagementPicker inline, Surface A): org → project, tag, reload, undo;
//   3. the tasks header (EngagementPicker field, Surface A): pick a project, undo;
//   4. a new shortcut's binding target (BindingTargetPicker): one organization, then one project.
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/hierarchy-cascade-walk.mjs <outDir>
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.WALK_ORIGIN ?? "http://hierarchy-cascade.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
mkdirSync(OUT, { recursive: true });
const APP_ID = "d9c30db7-dcce-46c3-a00e-9498342692a9";
const ORG = "admin's Workspace";
const PROJECT = "Mobile Note App";
const TASK = "Build mobile note app";
const TYPE = "Goals";
const SCOPE = "Build Muscle";

const browser = await chromium.launch({ headless: true });
const report = { steps: [], consoleErrors: {} };
let where = "sign-in";
let n = 1;
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
page.on("console", (m) => {
  if (m.type() === "error") (report.consoleErrors[where] ??= []).push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => (report.consoleErrors[where] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
const shot = async (name) => {
  const file = `${OUT}/${String(n++).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file });
  return file;
};
const step = (s) => {
  report.steps.push(s);
  console.log(JSON.stringify(s));
};
const dismissBanners = async () => {
  const d = page.getByRole("button", { name: /Dismiss for today/ });
  if (await d.isVisible().catch(() => false)) await d.click().catch(() => undefined);
};
const millerRow = (label) =>
  page.locator('[data-miller-rungs="engagements"] button[aria-pressed]').filter({ hasText: label }).first();
async function pick(label, want) {
  const row = millerRow(label);
  await until(`${label} row`, async () => (await row.count()) > 0, 90000);
  const on = (await row.getAttribute("aria-pressed")) === "true";
  if (on !== want) await row.click();
  await until(`${label} ${want}`, async () => ((await row.getAttribute("aria-pressed")) === "true") === want, 30000);
  return (await row.getAttribute("aria-pressed")) === "true";
}
async function focusType(label) {
  const b = page.locator('[data-miller-row="scope-tags"] button[aria-current]').filter({ hasText: label }).first();
  await b.click();
}
const fieldText = async () => (await page.locator('[data-engagement-picker="field"]').first().textContent())?.trim();

try {
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");

  // ── 1. Agent app settings ──
  where = "agent-app";
  const appUrl = `${ORIGIN}/agent-apps/${APP_ID}/settings`;
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector('[data-engagement-picker="field"]', { timeout: 240000 });
  await dismissBanners();
  step({ site: "agent-app", before: await fieldText() });
  await page.locator('[data-engagement-picker="field"]').click();
  await page.waitForSelector('[data-miller-rungs="engagements"]', { timeout: 60000 });
  await pick(PROJECT, true);
  await sleep(1500);
  await pick(TASK, true);
  await sleep(1500);
  await focusType(TYPE);
  await pick(SCOPE, true);
  await sleep(2000);
  step({ site: "agent-app", picked: true, shot: await shot("agent-app-picked") });
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-engagement-picker="field"]', { timeout: 240000 });
  await until("persisted chain", async () => (await fieldText())?.includes(TASK), 60000);
  const afterReload = await fieldText();
  step({ site: "agent-app", afterReload, persisted: afterReload.includes(PROJECT) && afterReload.includes(TASK), shot: await shot("agent-app-after-reload") });
  // undo
  await page.locator('[data-engagement-picker="field"]').click();
  await page.waitForSelector('[data-miller-rungs="engagements"]', { timeout: 60000 });
  await focusType(TYPE);
  await pick(SCOPE, false);
  await sleep(1500);
  await pick(TASK, false);
  await sleep(1500);
  await pick(PROJECT, false);
  await sleep(2000);
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-engagement-picker="field"]', { timeout: 240000 });
  await sleep(3000);
  const undone = await fieldText();
  step({ site: "agent-app", undone, clean: !undone.includes(PROJECT), shot: await shot("agent-app-undone") });

  // ── 2. Research start form (inline, Surface A) ──
  where = "research";
  await page.goto(`${ORIGIN}/research/topics/new?mode=manual&step=2`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await dismissBanners();
  const inline = await until("research inline picker", async () => (await page.locator('[data-engagement-picker="inline"]').count()) > 0, 180000);
  if (inline.v) {
    await pick(ORG, true);
    await pick(PROJECT, true);
    await focusType(TYPE);
    await pick("Lose 10 Pounds", true);
    step({ site: "research", picked: true, shot: await shot("research-picked") });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-engagement-picker="inline"]', { timeout: 240000 });
    await sleep(3000);
    const orgStill = (await millerRow(ORG).getAttribute("aria-pressed")) === "true";
    const projectStill = (await millerRow(PROJECT).getAttribute("aria-pressed").catch(() => null)) === "true";
    step({ site: "research", afterReload: { organizationHeld: orgStill, projectHeld: projectStill }, shot: await shot("research-after-reload") });
    if (projectStill) await pick(PROJECT, false);
    const tag = millerRow("Lose 10 Pounds");
    await focusType(TYPE).catch(() => undefined);
    if ((await tag.getAttribute("aria-pressed").catch(() => null)) === "true") await tag.click();
    step({ site: "research", undone: true });
  } else {
    step({ site: "research", error: "inline picker not found" });
    await shot("research-missing");
  }

  // ── 3. Tasks header (field, Surface A) ──
  where = "tasks";
  await page.goto(`${ORIGIN}/tasks`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await dismissBanners();
  const tf = await until("tasks field", async () => (await page.locator('[data-engagement-picker="field"]').count()) > 0, 180000);
  if (tf.v) {
    await page.locator('[data-engagement-picker="field"]').first().click();
    await page.waitForSelector('[data-miller-rungs="engagements"]', { timeout: 60000 });
    await pick(PROJECT, true);
    step({ site: "tasks", picked: true, field: await fieldText(), shot: await shot("tasks-picked") });
    await pick(PROJECT, false);
    await page.keyboard.press("Escape");
    step({ site: "tasks", undone: true, field: await fieldText() });
  } else {
    step({ site: "tasks", error: "field not found" });
    await shot("tasks-missing");
  }

  // ── 4. New shortcut: binding target, one node ──
  where = "shortcut";
  await page.goto(`${ORIGIN}/agents/shortcuts/new`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await dismissBanners();
  const bt = await until("binding target", async () => (await page.locator("[data-binding-target-picker] button[role=combobox]").count()) > 0, 180000);
  if (bt.v) {
    const trig = page.locator("[data-binding-target-picker] button[role=combobox]").first();
    step({ site: "shortcut", before: (await trig.textContent())?.trim() });
    await trig.click();
    await page.locator(`button[aria-label^="Select ${ORG}"]`).first().click();
    await sleep(500);
    step({ site: "shortcut", afterOrg: (await trig.textContent())?.trim() });
    await trig.click();
    await page.locator("button", { hasText: ORG }).filter({ hasNot: page.locator("[aria-label]") }).first().click().catch(async () => {
      // the row next to the check glyph drills
      await page.locator(`button:not([aria-label]):has-text("${ORG}")`).first().click();
    });
    await page.locator(`button[aria-label="Select ${PROJECT}"]`).first().click();
    await sleep(500);
    step({ site: "shortcut", afterProject: (await trig.textContent())?.trim(), shot: await shot("shortcut-single-node") });
  } else {
    step({ site: "shortcut", error: "binding target not found" });
    await shot("shortcut-missing");
  }
} catch (e) {
  report.error = String(e).split("\n")[0];
  await shot("error").catch(() => undefined);
} finally {
  writeFileSync(`${OUT}/walk-report.json`, JSON.stringify(report, null, 2));
  console.log("consoleErrors", JSON.stringify(report.consoleErrors));
  console.log("error", report.error ?? "none");
  await browser.close();
}
