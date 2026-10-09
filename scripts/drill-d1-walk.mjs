// scripts/drill-d1-walk.mjs — lane DRILL-D1 (VERIFY-DRILL-FINAL "Deployed re-verify" D1, D2), 2026-10-01.
//
// Read-only headless walk on the shared preview as admin@admin.com: AI usage by execution, last 7 days,
// open Findings — every finding row reads a name within seconds (never "Reading the name…"), and the
// page asks the names door after the panel opens. Then run analysis, All time: no drillDescribe 403.
// Nothing is saved or written.
//
//   ORIGIN=http://<session>.localhost:3001 node scripts/drill-d1-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";
import { formatDurationMs } from "@ai-matrx/kit/format";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3001";
const SHOTS = process.env.SHOTS ?? "/tmp/matrx-evidence/2026-10-01/drill-d1";
mkdirSync(SHOTS, { recursive: true });
const out = { origin: ORIGIN, started: new Date().toISOString(), checks: [], console_errors: [], requests_after_open: [] };
const readEnv = (p) => Object.fromEntries(readFileSync(p, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };
const check = (name, ok, detail) => {
  out.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${String(detail).slice(0, 400)}`);
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 300)}`));
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  check("signed in as admin@admin.com", who === "admin@admin.com", who);

  await page.goto(`${ORIGIN}/administration/usage?def=ai_usage_executions&w=7d`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await until("answer", async () => ((await page.locator("[data-matrx-drill-into]").count()) > 0 ? "ok" : null), 240000);
  await sleep(2000);
  let watching = false;
  page.on("request", (r) => watching && /rpc\//.test(r.url()) && out.requests_after_open.push(r.url().replace(/^.*\/rest\/v1\//, "")));
  watching = true;
  const opened = Date.now();
  await page.locator("[data-drill-explorer-findings]").first().click();
  const rowsText = async () => page.locator("[data-drill-explorer-finding-row]").allTextContents();
  // every finding answered (no skeleton) and no row still loading
  const settled = await until(
    "findings named",
    async () => {
      const skeletons = await page.locator("[data-drill-explorer-finding] .animate-pulse").count();
      const rows = await rowsText();
      return skeletons === 0 && rows.length > 0 && !rows.some((t) => /Reading the name/.test(t)) ? rows : null;
    },
    60000,
  ).catch((e) => ({ v: null, error: e.message }));
  const elapsed = formatDurationMs(Date.now() - opened, { style: "compact" });
  const rows = await rowsText();
  out.rows = rows;
  await page.screenshot({ path: `${SHOTS}/01-findings-named.png` });
  check(`every Findings row is named (${rows.length} rows, ${elapsed})`, Boolean(settled?.v) && rows.every((t) => !/Reading the name/.test(t)), rows.slice(0, 40).join(" | "));
  const asked = out.requests_after_open.filter((u) => /ai_usage_names/.test(u)).length;
  check("the names door is asked after the panel opens", asked > 0, `${asked} ai_usage_names reads; ${out.requests_after_open.length} rpc calls`);
  const uuidRows = rows.filter((t) => /[0-9a-f]{8}-[0-9a-f]{4}-/.test(t));
  check("no row shows a raw id", uuidRows.length === 0, uuidRows.join(" | "));

  out.console_errors.length = 0;
  await page.goto(`${ORIGIN}/workflows/runs/analyze?w=all`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await sleep(15000);
  await page.screenshot({ path: `${SHOTS}/02-run-analysis-all-time.png` });
  const describe403 = out.console_errors.filter((e) => /not offered for drilling|403/.test(e));
  check("run analysis All time: no drillDescribe 403", describe403.length === 0, describe403.join(" | ") || `${out.console_errors.length} console errors`);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk.json`, JSON.stringify(out, null, 2));
  await browser.close();
}
