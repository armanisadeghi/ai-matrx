// scripts/drill-live-fixes-walk.mjs — lane DRILL-LIVE-FIXES (VERIFY-DRILL-LIVE F1, F3–F9, 2026-09-30).
//
// A headless, READ-ONLY walk as admin@admin.com (through the login form) of what the lane changed, at
// 1280 px and 390 px, light and dark. Nothing is saved, pressed inside Alchemy, or written.
//   F1  /administration/usage carries no "Missing feature knob" text and no "Defaults" badge
//   F3  the records of admin · claude-opus-5 · Sep 12 read "N executions", their sums, the door's total
//   F4  their time column formatted, no whole UUID leading a row
//   F5  "Hours that spiked" shows the true count past the cap
//   F6  the KG built-in view "What a successful run costs" keeps the header total; cleanup cost is a column
//   F7  workflow runs at f.workflow=<Verification Desk>: the crumb reads "Verification Desk"
//   F8  a UTC chip, once, on the platform lane
//   F9  at 390 px no toolbar control is clipped (scrollWidth <= clientWidth) and the page does not scroll sideways
//
//   ORIGIN=http://drilllivefix.localhost:3001 node scripts/drill-live-fixes-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drilllivefix.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/tmp/matrx-evidence/2026-09-30/drill-live-fixes";
mkdirSync(SHOTS, { recursive: true });
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const VERIFICATION_DESK = "aa3e6306-dc2a-485b-b656-3fff9b790b26";
const out = { origin: ORIGIN, started: new Date().toISOString(), steps: [], frictions: [], console_errors: [] };
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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 240)}`));
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const text = async (sel) => ((await page.locator(sel).first().textContent({ timeout: 2000 }).catch(() => "")) ?? "").replace(/\s+/g, " ").trim();

async function go(target) {
  for (let n = 1; n <= 6; n += 1) {
    await page.goto(`${ORIGIN}${target}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await sleep(1500);
    if ((await page.getByRole("button", { name: /Resume/ }).count()) === 0) return;
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(4000 * n);
  }
}
const answered = (label) =>
  until(label, async () => ((await page.locator("[data-matrx-drill-into], [data-drill-explorer-records-count]").count()) > 0 ? true : null), 180000).catch(() => false);
// the app themes by a class on <html> (the person's own setting), not by the media query alone
const theme = (scheme) => page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), scheme === "dark");
const settleTotal = () => until("header total", async () => ((await text("[data-drill-explorer-total]")) && (await text("[data-drill-explorer-total]")) !== "…" ? true : null), 120000).catch(() => false);

async function toolbarClipped() {
  return page.evaluate(() => {
    const bar = document.querySelector("[data-drill-explorer-controls]");
    if (!bar) return { found: false };
    const clipped = [...bar.querySelectorAll("button")]
      .filter((b) => b.offsetParent !== null)
      .flatMap((b) => [...b.querySelectorAll("span.truncate"), b])
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent?.trim().slice(0, 30));
    return { found: true, clipped, pageScroll: document.documentElement.scrollWidth, width: window.innerWidth };
  });
}

try {
  await go("/login");
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  step("signed in", { who });
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);

  // F1 + F8: the usage page, 30 days by person
  await go("/administration/usage?by=person&w=30d");
  await answered("usage by person");
  await settleTotal();
  await sleep(4000);
  const body = (await page.locator("body").textContent()) ?? "";
  const f1 = {
    missingKnob: /Missing feature knob|could not be read \(knob/i.test(body),
    defaultsBadge: await page.locator("[data-drill-explorer-knob-said]").count(),
    utcChips: await page.locator("[data-drill-explorer-time-zone]").count(),
    from: await text("[data-drill-explorer-window-start]"),
    freshness: await text("[data-drill-explorer-freshness]"),
    reconcile: await text("[data-drill-explorer-reconcile]"),
    notes: await text("[data-drill-explorer-notes]"),
    total: await text("[data-drill-explorer-total]"),
  };
  step("F1/F8 usage page", f1);
  await shot("01-usage-1280-light");
  if (f1.missingKnob) friction("F1: a knob sentence is still on /administration/usage");
  if (f1.defaultsBadge > 0) friction("F1: a drill setting could not be read (Defaults badge shown)");
  if (f1.utcChips !== 1) friction(`F8: ${f1.utcChips} UTC chips`);

  // F5: findings
  await page.locator("[data-drill-explorer-findings]").first().click();
  await until("findings answered", async () => ((await page.locator("[data-drill-explorer-finding-count], [data-drill-explorer-finding-none]").count()) > 0 ? true : null), 120000).catch(() => false);
  const f5 = { count: await text("[data-drill-explorer-finding-count]"), hint: await page.locator('[data-drill-explorer-finding] [aria-label="Past the group cap"]').count(), panel: (await text('[data-drill-explorer-finding="spikes"]')).slice(0, 160) };
  step("F5 findings", f5);
  await shot("02-findings");
  await page.keyboard.press("Escape");

  // F3/F4: the records of admin · claude-opus-5 · Sep 12 (UTC)
  await go(`/administration/usage?by=&f.person=${ADMIN}&f.model=claude-opus-5&w=2026-09-12..2026-09-13`);
  await until("records", async () => ((await page.locator("[data-drill-explorer-records-count]").count()) > 0 ? true : null), 180000).catch(() => false);
  await sleep(3000);
  const firstRow = await page.evaluate(() => [...(document.querySelector("[data-drill-explorer-records] tbody tr")?.querySelectorAll("td") ?? [])].slice(0, 4).map((td) => td.textContent?.trim()));
  const f3 = {
    header: await text("[data-drill-explorer-records-header]"),
    pager: ((await page.locator("[data-drill-explorer-records]").first().textContent()) ?? "").match(/\d[\d,]*\s*[–-]\s*\d[\d,]*\s+of\s+[\d,]+/)?.[0] ?? null,
    firstRow,
  };
  step("F3/F4 records", f3);
  await shot("03-records-1280");
  if (!/executions/.test(f3.header)) friction("F3: the records count is not in executions");
  if (firstRow.some((c) => /^\d{4}-\d{2}-\d{2}T/.test(c ?? ""))) friction("F4: a raw timestamp in the first row");
  if (firstRow.some((c) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(c ?? ""))) friction("F4: a whole UUID in the first row");

  // F6: KG built-in view without the cost Measure; default table carries cleanup cost
  await go("/administration/knowledge/kg-cost/explore");
  await answered("kg default");
  const kgHeaders = await page.evaluate(() => [...document.querySelectorAll("[data-matrx-drill-answer] thead th")].map((th) => th.textContent?.trim()));
  await go("/administration/knowledge/kg-cost/explore?view=builtin:successful_run_cost");
  await answered("kg successful view");
  await settleTotal();
  await sleep(2500);
  const f6 = { headers: kgHeaders, viewTotal: await text("[data-drill-explorer-total]") };
  step("F6 KG", f6);
  await shot("04-kg-successful-view");
  if (f6.viewTotal === "—" || f6.viewTotal === "…") friction("F6: the KG view's header total is blank");
  if (!kgHeaders.some((h) => /Cleanup/i.test(h ?? ""))) friction("F6: the KG default table has no cleanup cost column");

  // F7: the workflow crumb opened from its address
  await go(`/administration/automation/workflow-runs?by=status&f.workflow=${VERIFICATION_DESK}&w=90d`);
  await answered("workflow runs");
  await until("crumb named", async () => (/Verification Desk/.test(await text('nav[aria-label="Drill trail"]')) ? true : null), 60000).catch(() => false);
  const f7 = { trail: await text('nav[aria-label="Drill trail"]') };
  step("F7 crumb", f7);
  await shot("05-workflow-crumb");
  if (!/Verification Desk/.test(f7.trail)) friction("F7: the workflow crumb does not read Verification Desk");

  // F9 + dark: 390 px, light and dark
  for (const scheme of ["light", "dark"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme });
    await go("/administration/usage?by=person&w=30d");
    await answered(`usage 390 ${scheme}`);
    await theme(scheme);
    await sleep(3000);
    const f9 = await toolbarClipped();
    step(`F9 390 ${scheme}`, f9);
    await shot(`06-usage-390-${scheme}`);
    if (f9.clipped?.length) friction(`F9 (${scheme}): clipped ${f9.clipped.join(", ")}`);
    if (f9.pageScroll > 390) friction(`F9 (${scheme}): page scrolls sideways (${f9.pageScroll})`);
    await go(`/administration/usage?by=&f.person=${ADMIN}&f.model=claude-opus-5&w=2026-09-12..2026-09-13`);
    await until("records 390", async () => ((await page.locator("[data-drill-explorer-records-count]").count()) > 0 ? true : null), 180000).catch(() => false);
    await theme(scheme);
    await sleep(2000);
    await shot(`07-records-390-${scheme}`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await go("/administration/usage?by=person&w=30d");
  await answered("usage dark 1280");
  await theme("dark");
  await sleep(3000);
  await shot("08-usage-1280-dark");
} catch (e) {
  friction(`walk stopped: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk.json`, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(`frictions: ${out.frictions.length}`);
}
