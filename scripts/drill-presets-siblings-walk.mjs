// scripts/drill-presets-siblings-walk.mjs — lane DRILL-PRESETS-RETIRE (VERIFY-DRILL-LIVE F2), headless,
// read-only, admin@admin.com: /administration/usage offers the three definitions' built-in views
// (grouped Usage / Per execution / Model calls) and all seven findings; opening a sibling's view or a
// sibling finding's row switches the explorer to that definition (`def=` in the address); the CX
// usage tab carries the model-calls explorer beside its old content. Nothing is saved or written.
//
//   ORIGIN=http://drillpresets.localhost:3001 node scripts/drill-presets-siblings-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillpresets.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-30/drill-presets";
mkdirSync(SHOTS, { recursive: true });
const out = { origin: ORIGIN, started: new Date().toISOString(), steps: [], console_errors: [], frictions: [] };
const step = (name, r = {}) => { out.steps.push({ name, ...r }); console.log(`· ${name}`, JSON.stringify(r).slice(0, 700)); };
const readEnv = (p) => Object.fromEntries(readFileSync(p, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 300)}`));
const groups = () => page.locator("[data-matrx-drill-into]");
const addr = () => decodeURIComponent(page.url().replace(ORIGIN, ""));
const answered = () => until("answer", async () => ((await groups().count()) > 0 ? "answered" : null), 180000).then((r) => r?.v ?? r).catch((e) => `timeout ${e.message}`);
try {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}`);
  await page.goto(`${ORIGIN}/administration/usage?w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  step("usage page", { outcome: await answered() });
  await sleep(4000);
  // 1. the Saved views menu: three groups
  await page.locator("[data-drill-explorer-saved-views]").first().click();
  await sleep(800);
  const labels = (await page.locator('[role="menu"] [role="group"], [role="menu"] div[role="none"], [role="menu"] [data-drill-explorer-view-group]').allTextContents()).length;
  const menuText = ((await page.locator('[role="menu"]').first().textContent()) ?? "").replace(/\s+/g, " ");
  const groupsSeen = ["Usage", "Per execution", "Model calls"].filter((g) => menuText.includes(g));
  step("saved views menu", { groupsSeen, button: (await page.locator("[data-drill-explorer-saved-views]").first().textContent())?.trim(), labels });
  await page.screenshot({ path: `${SHOTS}/siblings-01-menu.png` });
  if (groupsSeen.length !== 3) out.frictions.push(`menu groups ${groupsSeen.join(",")}`);
  // 2. open a Model calls view
  await page.locator('[data-drill-explorer-view="Model calls:cx_by_model"]').first().click();
  await until("switched", async () => (addr().includes("def=ai_calls") ? true : null), 60000).catch(() => null);
  const o2 = await answered();
  await sleep(3000);
  step("opened Model calls › Usage by model", { address: addr(), outcome: o2, first: (await groups().allTextContents()).slice(0, 4) });
  await page.screenshot({ path: `${SHOTS}/siblings-02-calls-view.png` });
  if (!addr().includes("def=ai_calls") || !addr().includes("by=")) out.frictions.push(`calls view address ${addr()}`);
  // 3. findings: seven, grouped
  await page.goto(`${ORIGIN}/administration/usage?w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await answered();
  const fbtn = page.locator("[data-drill-explorer-findings]").first();
  const flabel = ((await fbtn.textContent()) ?? "").trim();
  await fbtn.click();
  await until("findings answered", async () => ((await page.locator("[data-drill-explorer-finding] .animate-pulse").count()) === 0 ? true : null), 180000).catch(() => null);
  const items = await page.locator("[data-drill-explorer-finding]").evaluateAll((els) => els.map((e) => ({ key: e.getAttribute("data-drill-explorer-finding"), text: (e.textContent ?? "").replace(/\s+/g, " ").slice(0, 120) })));
  step("findings panel", { button: flabel, items });
  await page.screenshot({ path: `${SHOTS}/siblings-03-findings.png` });
  if (!/Findings \(7\)/.test(flabel)) out.frictions.push(`findings button "${flabel}"`);
  // 4. a Per execution finding row opens that definition
  const row = page.locator('[data-drill-explorer-finding^="ai_usage_executions:"] [data-drill-explorer-finding-row]').first();
  if ((await row.count()) > 0) {
    const rowText = ((await row.textContent()) ?? "").trim();
    await row.click();
    await until("switched", async () => (addr().includes("def=ai_usage_executions") ? true : null), 60000).catch(() => null);
    const o4 = await answered();
    step("opened a Per execution finding row", { rowText, address: addr(), outcome: o4 });
    await page.screenshot({ path: `${SHOTS}/siblings-04-finding-row.png` });
    if (!addr().includes("def=ai_usage_executions")) out.frictions.push(`finding row address ${addr()}`);
  } else out.frictions.push("no Per execution finding row to open");
  // 5. the CX usage tab carries the model-calls explorer
  await page.goto(`${ORIGIN}/administration/chat/cx-dashboard/usage`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const mount = page.locator("[data-cx-usage-calls-explorer]");
  await until("cx mount", async () => ((await mount.locator("[data-matrx-drill-into]").count()) > 0 ? true : null), 180000).catch(() => null);
  step("CX usage tab mount", { present: (await mount.count()) > 0, groups: await mount.locator("[data-matrx-drill-into]").count(), oldContent: (await page.getByText("Usage & Cost Analytics").count()) > 0 });
  await mount.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${SHOTS}/siblings-05-cx-tab.png` });
  if ((await mount.locator("[data-matrx-drill-into]").count()) === 0) out.frictions.push("CX tab mount did not answer");
} catch (e) {
  out.error = String(e);
  console.error(e);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk-siblings.json`, JSON.stringify(out, null, 2));
  console.log(`frictions: ${out.frictions.length}; console errors: ${out.console_errors.length}`);
  await browser.close();
}
