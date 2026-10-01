// scripts/drill-wire-walk.mjs — lane DRILL-WIRE (program DRILL-FINISH, 2026-09-30).
//
// A headless, read-only walk as admin@admin.com on the shared preview (live database): the usage
// explorer wired to the published drill primitives — "Usage by person" searches a person by email,
// a person row's right-click and ⋯ menu carry the admin user menu (looked at, never pressed), Last
// active hour + Total tokens columns, origin colours on the chart and share bars, "Most expensive
// requests" with Tool calls and a request's records with finish reason, then a 390 px phone in dark.
// Nothing is saved, pressed or written.
//
//   DEV_LOGIN_URL=<pnpm dev-login nonce URL> ORIGIN=http://drillwire.localhost:3001 node scripts/drill-wire-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillwire.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-30/drill-wire";
mkdirSync(SHOTS, { recursive: true });
const out = { origin: ORIGIN, started: new Date().toISOString(), checks: [], console_errors: [], frictions: [] };
const readEnv = (p) => Object.fromEntries(readFileSync(p, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 300)}`));
const groups = () => page.locator("[data-matrx-drill-into]");
const answered = async () => {
  const r = await until("answer", async () => ((await groups().count()) > 0 ? "answered" : null), 240000).catch((e) => `timeout: ${e.message}`);
  return r?.v ?? r;
};
const headers = async () => (await page.locator("[data-matrx-drill-answer] thead th").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
const check = (name, ok, detail) => {
  out.checks.push({ name, ok, detail });
  if (!ok) out.frictions.push(`${name}: ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${String(detail).slice(0, 300)}`);
};
const ADMIN_MENU = ["Open account", "Organizations", "Admin level", "Preferences", "Usage & cost", "Acquisition", "Email user"];

try {
  if (process.env.DEV_LOGIN_URL) {
    await page.goto(process.env.DEV_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 240000 });
    await sleep(8000);
    out.who = "admin@admin.com (dev-login nonce)";
  } else {
    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
    if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);
    out.who = who;
  }

  // 1. Usage by person: columns, then search an email
  await page.goto(`${ORIGIN}/administration/usage?view=builtin:usage_by_person&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("usage by person answers", (await answered()) === "answered", page.url().replace(ORIGIN, ""));
  await sleep(4000);
  const h1 = await headers();
  check("Total tokens and Last active hour columns", h1.includes("Total tokens") && h1.some((h) => /^Last active/.test(h)), h1.join(" | "));
  await page.screenshot({ path: `${SHOTS}/usage_by_person.png` });

  const search = page.locator("[data-matrx-drill-search]");
  check("the answer has a search box", (await search.count()) === 1, `${await search.count()} boxes`);
  const before = await page.locator('[data-matrx-drill-level="0"]').count();
  await search.fill("admin@admin.com");
  await sleep(1500);
  const rows = page.locator('[data-matrx-drill-level="0"]');
  const after = await rows.count();
  const shown = ((await rows.first().textContent()) ?? "").replace(/\s+/g, " ");
  const count = ((await page.locator("[data-matrx-drill-search-count]").textContent().catch(() => "")) ?? "").trim();
  check("searching an email finds the person", after >= 1 && after < before && /admin@admin\.com|admin/i.test(shown), `${before} → ${after} rows; "${count}"; first: ${shown.slice(0, 160)}`);
  await page.screenshot({ path: `${SHOTS}/search_email.png` });

  // 2. The person row's ⋯ menu and right-click carry the admin user menu (looked at, never pressed)
  await rows.first().locator("[data-matrx-drill-menu]").click();
  await sleep(800);
  const doorIds = await page.locator("[data-matrx-drill-door]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-matrx-drill-door")}=${(e.textContent ?? "").trim()}`));
  check("the row menu offers the admin user menu", ADMIN_MENU.every((l) => doorIds.some((d) => d.endsWith(`=${l}`))), doorIds.join(" | "));
  await page.screenshot({ path: `${SHOTS}/row_menu.png` });
  await page.keyboard.press("Escape");
  await sleep(500);
  await rows.first().click({ button: "right", position: { x: 40, y: 8 } });
  await sleep(1200);
  const menuText = ((await page.locator("[role='menu']").first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ");
  check("right-click on a person row shows the admin user menu", ADMIN_MENU.every((l) => menuText.includes(l)), menuText.slice(0, 400));
  await page.screenshot({ path: `${SHOTS}/right_click.png` });
  await page.keyboard.press("Escape");
  await sleep(500);

  // 3. Origin colours: chart series and share bars keep the declared chart tokens
  await page.goto(`${ORIGIN}/administration/usage?by=origin&share=1&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("usage by origin answers", (await answered()) === "answered", page.url().replace(ORIGIN, ""));
  await until("chart legend", async () => ((await page.locator("[data-matrx-drill-chart-series]").count()) > 0 ? "ok" : null), 120000).catch(() => null);
  await sleep(3000);
  const legend = await page.locator("[data-matrx-drill-chart-series]").evaluateAll((els) =>
    els.map((e) => ({ key: e.getAttribute("data-matrx-drill-chart-series"), label: (e.textContent ?? "").trim(), color: e.querySelector("span[aria-hidden]")?.getAttribute("style") ?? "" })),
  );
  out.legend = legend;
  const declared = { human: "--matrx-chart-1", client_auto: "--matrx-chart-9", api: "--matrx-chart-7", child_agent: "--matrx-chart-3", workflow: "--matrx-chart-4", scheduled: "--matrx-chart-5", system: "--matrx-chart-6" };
  const keyOf = (s) => String(s.key ?? "").replace(/^v:/, "");
  const judged = legend.filter((s) => declared[keyOf(s)]);
  check("chart series keep the origin colours", judged.length > 0 && judged.every((s) => s.color.includes(`${declared[keyOf(s)]})`)), legend.map((s) => `${s.key}:${(s.color.match(/--matrx-chart-[\w]+/) ?? [""])[0]}`).join(" | "));
  const bars = await page.locator("[data-matrx-drill-share-bar]").evaluateAll((els) => els.map((e) => e.getAttribute("style") ?? ""));
  check("share bars draw in the origin colours", bars.some((s) => /--matrx-chart-\d/.test(s)), bars.slice(0, 6).join(" | "));
  await page.screenshot({ path: `${SHOTS}/origin_colours.png` });

  // 4. Most expensive requests: Tool calls + Last active; a request's records: finish reason
  await page.goto(`${ORIGIN}/administration/usage?def=ai_usage_executions&view=builtin:costliest_requests&w=7d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  check("most expensive requests answers", (await answered()) === "answered", page.url().replace(ORIGIN, ""));
  await sleep(4000);
  const h2 = await headers();
  check("most expensive requests shows Tool calls and Last active", h2.includes("Tool calls") && h2.some((h) => /^Last active/.test(h)), h2.join(" | "));
  await page.screenshot({ path: `${SHOTS}/costliest_requests.png` });
  await page.locator('[data-matrx-drill-level="0"]').first().locator("[data-matrx-drill-menu]").click();
  await page.locator('[data-matrx-drill-action="records"]').click();
  await sleep(12000);
  const recordHeads = (await page.locator("th").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
  check("a request's records carry its finish reason and tool calls", recordHeads.some((t) => /finish reason/i.test(t)) && recordHeads.some((t) => /tool calls/i.test(t)), recordHeads.filter(Boolean).slice(0, 30).join(" | "));
  await page.screenshot({ path: `${SHOTS}/request_records.png` });

  // 5. 390 px in dark
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", storageState: await context.storageState() });
  const p2 = await phone.newPage();
  await p2.goto(`${ORIGIN}/administration/usage?view=builtin:usage_by_person&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await until("phone answer", async () => ((await p2.locator("[data-matrx-drill-into]").count()) > 0 ? "ok" : null), 240000).catch(() => null);
  await sleep(4000);
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const dark = await p2.evaluate(() => document.documentElement.classList.contains("dark") || matchMedia("(prefers-color-scheme: dark)").matches);
  const phoneSearch = await p2.locator("[data-matrx-drill-search]").isVisible().catch(() => false);
  check("390 px dark: no page overflow, search reachable", overflow <= 1 && dark && phoneSearch, `overflow ${overflow}px, dark ${dark}, search visible ${phoneSearch}`);
  await p2.screenshot({ path: `${SHOTS}/phone_dark.png`, fullPage: false });
  await phone.close();
} catch (e) {
  out.frictions.push(`walk stopped: ${e.message}`);
  console.log("walk stopped:", e.message);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk.json`, JSON.stringify(out, null, 2));
  await browser.close();
}
console.log(`frictions ${out.frictions.length}, console errors ${out.console_errors.length}`);
