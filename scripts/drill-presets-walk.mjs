// scripts/drill-presets-walk.mjs — lane DRILL-PRESETS-RETIRE (program DRILL-FINISH, 2026-09-30).
//
// A headless, read-only walk as admin@admin.com (through the login form): every built-in Saved view of
// ai_usage opens from its address alone (`/administration/usage?view=builtin:<key>`), answers, and its
// groups read as words (no code, no id); a person's usage link (`&f.person=<id>`) opens that person.
// Nothing is saved, pressed or written.
//
//   ORIGIN=http://drillpresets.localhost:3001 node scripts/drill-presets-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drillpresets.localhost:3001";
const SHOTS = process.env.SHOTS ?? "/tmp/matrx-evidence/2026-09-30/drill-presets";
mkdirSync(SHOTS, { recursive: true });
const CALL_VIEWS = ["cx_by_model", "cx_by_provider", "cx_by_day", "cx_by_origin", "cx_cost_share", "cx_latency", "reconcile_calls"];
const EXECUTION_VIEWS = ["by_conversation", "by_session", "costliest_requests", "reconcile_ledger"];
const ONLY = process.env.ONLY ?? "all";
const VIEWS = ["usage_by_person", "usage_by_person_and_origin", "spend_by_organization", "spend_by_person", "spend_by_agent", "spend_by_app", "spend_by_feature",
  "spend_by_origin", "spend_by_trigger", "spend_by_source", "spend_by_model", "spend_by_day", "spend_by_hour"];
const CODE = /(^[a-z0-9]+([_.:-][a-z0-9]+)+$)|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/;
const MODEL_NAME = /^(claude|gpt|gemini|grok|kimi|llama|o\d|text-|whisper|eleven|qwen|deepseek|moonshot|sonar|imagen|veo|flux|mistral|gemma|cerebras)/i;
const out = { origin: ORIGIN, started: new Date().toISOString(), views: [], console_errors: [], frictions: [] };
const readEnv = (p) => Object.fromEntries(readFileSync(p, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(`${page.url().replace(ORIGIN, "")}: ${m.text().slice(0, 300)}`));
const groups = () => page.locator("[data-matrx-drill-into]");
async function answered() {
  await sleep(500);
  return until("answer", async () => {
    if ((await groups().count()) > 0) return "answered";
    await sleep(3000);
    if ((await groups().count()) > 0) return "answered";
    const text = (await page.locator("[data-drill-explorer]").first().textContent().catch(() => "")) ?? "";
    if (/could not|refus|cannot be/i.test(text)) return `said: ${text.slice(0, 200)}`;
    return null;
  }, 180000).catch((e) => `timeout: ${e.message}`);
}

async function resume() {
  for (let n = 1; n <= 8; n += 1) {
    await sleep(1500);
    const parked = page.url().includes("__dev-walk") || (await page.getByRole("button", { name: /^Resume$/ }).count()) > 0;
    if (!parked) return;
    console.log(`[walk] parked by the walk cap (try ${n}) — resuming`);
    await page.getByRole("button", { name: /^Resume$/ }).first().click().catch(() => {});
    await sleep(5000 * n);
  }
}
const _goto = page.goto.bind(page);
page.goto = async (u, o) => { const r = await _goto(u, o); await resume(); if (page.url().includes("__dev-walk")) return _goto(u, o); return r; };
try {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);
  out.who = who;
  const plan = [
    ...(ONLY === "all" || ONLY === "usage" ? VIEWS.map((k) => ["/administration/usage", k]) : []),
    ...(ONLY === "all" || ONLY === "grains" ? CALL_VIEWS.map((k) => ["/administration/usage?def=ai_calls", k]) : []),
    ...(ONLY === "all" || ONLY === "grains" ? EXECUTION_VIEWS.map((k) => ["/administration/usage?def=ai_usage_executions", k]) : []),
  ];
  for (const [path, key] of plan) {
    await page.goto(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}view=builtin:${key}&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const outcome = await answered();
    await sleep(5000); // names arrive after the answer
    const address = decodeURIComponent(page.url().replace(ORIGIN, ""));
    const labels = (await groups().allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).slice(0, 25);
    const codes = labels.filter((l) => CODE.test(l) && !MODEL_NAME.test(l));
    const note = ((await page.locator("[data-drill-explorer-note]").first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    const windowWords = ((await page.locator("[data-matrx-drill-window]").first().textContent().catch(() => "")) ?? "").trim();
    const row = { path, key, window: windowWords, note: note.slice(0, 300), outcome: outcome?.v ?? outcome, address, groups: labels.length, first: labels.slice(0, 6), codes };
    out.views.push(row);
    console.log(`· ${key}`, JSON.stringify(row).slice(0, 500));
    if (row.outcome !== "answered") out.frictions.push(`${key}: ${row.outcome}`);
    if (!/by=/.test(address)) out.frictions.push(`${key}: the address did not take the view's question (${address})`);
    if (codes.length) out.frictions.push(`${key}: codes on screen ${codes.join(", ")}`);
    await page.screenshot({ path: `${SHOTS}/${key}.png` });
  }
  // the findings panel on the executions mount (the Spend page's dig-here signals)
  if (ONLY !== "usage") {
    await page.goto(`${ORIGIN}/administration/usage?def=ai_usage_executions&w=30d`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await answered();
    const findings = page.locator("[data-drill-findings], [data-drill-explorer-findings]").first();
    const btn = page.getByRole("button", { name: /Findings/ }).first();
    const label = ((await btn.textContent().catch(() => "")) ?? "").trim();
    out.findings = { button: label, present: (await btn.count()) > 0 || (await findings.count()) > 0 };
    console.log("· findings", JSON.stringify(out.findings));
    if (!/Findings \(6\)/.test(label)) out.frictions.push(`executions findings button reads "${label}"`);
  }
  // a person's usage link, as AdminUserRef / the user menu / the accounts table now write it
  const me = await page.evaluate(async () => (await (await fetch("/api/whoami")).json()));
  const id = me?.user_id;
  await page.goto(`${ORIGIN}/administration/usage?view=builtin:usage_by_person&f.person=${id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const o = await answered();
  const trail = ((await page.locator("[data-drill-explorer]").first().textContent()) ?? "").includes("admin@admin.com");
  out.person_link = { id, outcome: o?.v ?? o, address: decodeURIComponent(page.url().replace(ORIGIN, "")), names_the_person: trail };
  console.log("· person link", JSON.stringify(out.person_link));
  if (!trail) out.frictions.push("the person link does not name admin@admin.com on screen");
  await page.screenshot({ path: `${SHOTS}/person-link.png` });
} catch (e) {
  out.error = String(e);
  console.error(e);
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk-${ONLY}.json`, JSON.stringify(out, null, 2));
  console.log(`frictions: ${out.frictions.length}; console errors: ${out.console_errors.length}`);
  await browser.close();
}
