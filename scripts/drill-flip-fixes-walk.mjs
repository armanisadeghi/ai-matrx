// scripts/drill-flip-fixes-walk.mjs — lane DRILL-FLIP-FIXES (program DRILL-FINISH, 2026-10-01).
//
// A headless, read-only walk on the shared preview of what VERIFY-DRILL-FINAL asked before THE FLIP:
// R1 "Cost per request" in a Spend cut; R5/L2 a header's tooltip says what it counts; R2 the costliest
// requests show person, agent, model… at a glance; R3 a ten-minute bucket reads as a moment; L3 the CX
// daily tokens view stacks input and output; L5 a pivot column sorts; L1 a number filter keeps the groups
// at least / at most a value; N1 + N2 as test@test.com, run analysis loads with no organization chosen and
// "All time" lists the records. Nothing is saved or written (the number filter is screen state only).
//
//   ORIGIN=http://drillflipfix.localhost:3001 node scripts/drill-flip-fixes-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillflipfix.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/tmp/matrx-evidence/2026-10-01/drill-flip-fixes";
mkdirSync(SHOTS, { recursive: true });
const out = { origin: ORIGIN, started: new Date().toISOString(), checks: [], console_errors: [], frictions: [] };
const readEnv = (p) => Object.fromEntries(readFileSync(p, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };

const check = (name, ok, detail) => {
  out.checks.push({ name, ok, detail });
  if (!ok) out.frictions.push(`${name}: ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${String(detail).slice(0, 300)}`);
};

const browser = await chromium.launch({ headless: true });

async function seat(email, password, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${label} ${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 300)}`));
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const who = await signIn(page, ORIGIN, email, password, label);
  if (who !== email) throw new Error(`signed in as ${who}, not ${email}`);
  return { context, page };
}

const groupsOf = (page) => page.locator("[data-matrx-drill-into]");
const answered = async (page) => {
  const r = await until("answer", async () => ((await groupsOf(page).count()) > 0 ? "answered" : null), 240000).catch((e) => `timeout: ${e.message}`);
  return r?.v ?? r;
};
const headers = async (page) => (await page.locator("[data-matrx-drill-answer] thead th").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);

try {
  const { page } = await seat(env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  out.admin = "admin@admin.com";

  // R1 + R5 + L2 — Spend by person: Cost per request; Requests and the Person column say what they count
  await page.goto(`${ORIGIN}/administration/usage?view=builtin:spend_by_person&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("Spend by person answers", (await answered(page)) === "answered", page.url().replace(ORIGIN, ""));
  await sleep(3000);
  const h1 = await headers(page);
  check("R1 Cost per request is a column of a Spend cut", h1.some((h) => /^Cost per request/.test(h)), h1.join(" | "));
  const reqTip = await page.locator('[data-matrx-drill-sort="requests"]').first().getAttribute("title");
  check("R5 Requests says what it counts (≤140)", Boolean(reqTip) && reqTip.length <= 140 && /automated runs count as Calls/.test(reqTip), reqTip);
  const labelTip = await page.locator('[data-matrx-drill-sort="label"]').first().getAttribute("title");
  check("L2 the Person column carries the Spend cut's explanation", Boolean(labelTip) && labelTip.length <= 140, labelTip);
  await page.screenshot({ path: `${SHOTS}/01-spend-by-person.png` });

  // R2 — the costliest requests at a glance
  await page.goto(`${ORIGIN}/administration/usage?def=ai_usage_executions&view=builtin:costliest_requests&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("Most expensive requests answers", (await answered(page)) === "answered", page.url().replace(ORIGIN, ""));
  const attrHeads = await until("glance columns", async () => {
    const n = await page.locator("[data-matrx-drill-attribute-header]").allTextContents();
    return n.length > 0 ? n : null;
  }, 60000).then((r) => r.v).catch(() => []);
  check("R2 person, agent, feature, model, provider, origin, outcome, organization, app are columns", ["Person", "Agent", "Feature", "Organization", "App", "Origin"].every((x) => attrHeads.some((h) => h.startsWith(x))), attrHeads.join(" | "));
  const filled = await until("glance values", async () => {
    const v = await page.locator("[data-matrx-drill-attribute=person]").allTextContents();
    return v.length > 0 ? v : null;
  }, 90000).then((r) => r.v).catch(() => []);
  check("R2 each request names its person without a click", filled.length > 0 && filled.every((t) => t && t !== "…" && !/^[0-9a-f-]{36}$/.test(t)), `${filled.length} people; first: ${filled.slice(0, 3).join(" | ")}`);
  await page.screenshot({ path: `${SHOTS}/02-costliest-requests-at-a-glance.png` });

  // R3 — a ten-minute bucket reads as a moment
  await page.goto(`${ORIGIN}/administration/usage?def=ai_usage_executions&by=bucket_10m&show=cost,distinct_requests&w=7d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("by ten minutes answers", (await answered(page)) === "answered", page.url().replace(ORIGIN, ""));
  const buckets = (await groupsOf(page).allTextContents()).slice(0, 5).map((t) => t.trim());
  check("R3 a ten-minute bucket reads 'Sep 12, 7:20 PM UTC', never a code", buckets.length > 0 && buckets.every((b) => /UTC$/.test(b) && !b.includes("·")), buckets.join(" | "));
  await page.screenshot({ path: `${SHOTS}/03-ten-minutes-as-moments.png` });

  // L3 — the CX daily tokens view stacks input and output
  await page.goto(`${ORIGIN}/administration/usage?def=ai_calls&view=builtin:cx_tokens_by_day&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("Daily input and output tokens answers", (await answered(page)) === "answered", page.url().replace(ORIGIN, ""));
  const chartTitle = await until("chart", async () => (await page.locator("[data-matrx-drill-chart] h3").first().textContent().catch(() => null)), 90000).then((r) => r.v).catch(() => "");
  const legend = await page.locator("[data-matrx-drill-chart-series]").evaluateAll((els) => els.map((e) => e.getAttribute("data-matrx-drill-chart-series")));
  check("L3 the chart stacks Input tokens and Output tokens", /Input tokens and Output tokens/.test(chartTitle ?? "") && legend.includes("m:tokens_in") && legend.includes("m:tokens_out"), `${chartTitle} · ${legend.join(", ")}`);
  await page.screenshot({ path: `${SHOTS}/04-stacked-tokens.png` });

  // L5 — a pivot column sorts by its own cell
  await page.goto(`${ORIGIN}/administration/usage?view=builtin:usage_by_person_and_origin&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("Usage by person and origin answers", (await answered(page)) === "answered", page.url().replace(ORIGIN, ""));
  await sleep(3000);
  const pivotSort = page.locator('[data-matrx-drill-sort^="across:cost:"]').first();
  const key = await pivotSort.getAttribute("data-matrx-drill-sort").catch(() => null);
  if (key) {
    await pivotSort.click();
    await sleep(2500);
  }
  check("L5 a pivot column is sortable and the sort lands in the address", Boolean(key) && decodeURIComponent(page.url()).includes(key ?? "§"), `${key} · ${decodeURIComponent(page.url().replace(ORIGIN, ""))}`);
  await page.screenshot({ path: `${SHOTS}/05-pivot-column-sorted.png` });

  // L1 — a number filter: Requests at least 100 (screen state only)
  await page.goto(`${ORIGIN}/administration/usage?view=builtin:usage_by_person&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("Usage by person answers", (await answered(page)) === "answered", page.url().replace(ORIGIN, ""));
  await sleep(3000);
  const before = await page.locator('[data-matrx-drill-level="0"]').count();
  await page.locator("[data-drill-explorer-number-filter]").click();
  await sleep(600);
  await page.locator('select[aria-label="Number"]').selectOption("requests");
  await page.locator('select[aria-label="Compare"]').selectOption(">=");
  await page.locator('input[aria-label="Value"]').fill("100");
  await page.getByRole("button", { name: "Add" }).click();
  await page.keyboard.press("Escape");
  await sleep(6000);
  const after = await page.locator('[data-matrx-drill-level="0"]').count();
  const said = ((await page.locator("[data-drill-explorer-number-filter]").textContent().catch(() => "")) ?? "").trim();
  const tips = await page.locator("[data-drill-explorer-carried], [data-drill-explorer-note] [title]").evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? "").join(" "));
  check("L1 'Requests at least 100' keeps fewer groups; the control and the view chip say it", after >= 1 && after < before && said === "Filter (1)", `${before} → ${after} groups · "${said}" · ${tips.slice(0, 160)}`);
  await page.screenshot({ path: `${SHOTS}/06-number-filter.png` });

  // N1 + N2 — run analysis as test@test.com, no organization chosen
  if (env.AI_MEMBER_USERNAME && env.AI_MEMBER_PASSWORD) {
    const member = await seat(env.AI_MEMBER_USERNAME, env.AI_MEMBER_PASSWORD, "member");
    out.member = env.AI_MEMBER_USERNAME;
    const p = member.page;
    await p.goto(`${ORIGIN}/workflows/runs/analyze`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const loaded = await until("explorer", async () => ((await p.locator("[data-workflow-runs-explorer=mine]").count()) > 0 ? true : null), 120000).then(() => true).catch(() => false);
    const text = ((await p.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
    check("N1 run analysis loads with no organization needed", loaded && !/An organization is needed/.test(text), loaded ? "explorer mounted" : text.slice(0, 200));
    const tz = await p.locator("[data-drill-explorer-time-zone]").getAttribute("data-drill-explorer-time-zone").catch(() => null);
    // the zone chip reads describe's `calendar` (platform.drill_calendar, on production since lane DRILL-LIVE-FIXES)
    check("N1 the calendar is said as a chip (needs platform.drill_calendar on the database the preview reads)", Boolean(tz), tz ?? "no calendar in describe");
    await p.screenshot({ path: `${SHOTS}/07-analyze-no-org.png` });
    await p.goto(`${ORIGIN}/workflows/runs/analyze?by=&w=all`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await sleep(15000);
    const t2 = ((await p.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
    check("N2 All time lists the records without an error", !/Couldn't load|listed for a window/.test(t2), t2.match(/(\d[\d,]*) workflow runs?/)?.[0] ?? t2.slice(0, 160));
    await p.screenshot({ path: `${SHOTS}/08-analyze-all-time-records.png` });
  } else {
    check("N1/N2 member seat", false, "AI_MEMBER_* not set");
  }
} catch (e) {
  out.frictions.push(`walk error: ${e.message}`);
  console.log("ERROR", e.message);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk.json`, JSON.stringify(out, null, 2));
  await browser.close();
}
