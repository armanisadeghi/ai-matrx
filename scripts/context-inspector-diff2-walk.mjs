// LANE INSPECTOR-DIFF-2 — headless proof, on the live site, that the context inspector never
// shows the model something a real turn would not get:
//   (1) Castellano & Reyes, LLP → Clients (a scope-type pick): the Selection tab's assembler
//       arguments carry the type alone (scope_ids []), exactly as a chat sends it, and the
//       compare's scope-count line still counts the type's scopes;
//   (2) "Answer on both paths" on admin's own Quick Test Agent: both answers, and the run-path
//       function (turn_context.assemble_turn_context) named under them. One run, tools off,
//       nothing saved. Read-only otherwise: every click is a selection or a tab.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/context-inspector-diff2-walk.mjs <outDir> [firstShotNumber]
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.INSPECTOR_ORIGIN ?? "https://manage.aimatrx.com";
const OUT = process.argv[2] ?? "/tmp";
let shot = Number(process.argv[3] ?? 36);
const first = shot;
mkdirSync(OUT, { recursive: true });
const PATH = "/administration/scopes-context/context-inspector";
const PICKS = ["Castellano & Reyes, LLP", "Clients"];
const QUICK_TEST_AGENT = "92c37a37-7630-4517-b2a2-b6f1d2427208";

const browser = await chromium.launch({ headless: true });
const report = { origin: ORIGIN, consoleErrors: {} };
let where = "sign-in";
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("response", (r) => {
  if (r.status() >= 400) (report.failedRequests ??= []).push({ at: where, status: r.status(), url: r.url().slice(0, 200) });
});
page.on("console", (m) => { if (m.type() === "error") (report.consoleErrors[where] ??= []).push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => (report.consoleErrors[where] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
const columns = (p) => p.locator("[data-context-inspector] .min-w-\\[560px\\] > div");
const open = async (query = "") => {
  await page.goto(`${ORIGIN}${PATH}${query}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-context-inspector] button[aria-pressed]", { timeout: 240000 });
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) await dismiss.click();
};
const tab = async (name) => {
  await page.locator(`[data-compare-tab="${name}"]`).click();
  await until(`${name} open`, async () => (await page.locator("[data-compare-tabs]").getAttribute("data-compare-tabs")) === name, 30000);
  await page.waitForTimeout(700);
};
try {
  for (let attempt = 1; ; attempt++) {
    try {
      report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
    }
  }

  // ── 1. The type pick: what the page sent, what the assembler received, what the compare counted.
  where = "type-pick";
  await open();
  const previews = [];
  page.on("response", async (r) => {
    if (r.url().includes("/ai/context/preview") && !r.url().includes("answer-both") && r.request().method() === "POST") {
      const body = await r.json().catch(() => ({}));
      previews.push({
        status: r.status(),
        sent: JSON.parse(r.request().postData() ?? "{}"),
        arguments: body.delivered?.arguments ?? null,
        todayActive: body.delivered?.today?.active ?? null,
        compareScopeIds: body.compare?.selection?.scope_ids ?? null,
        oldScopes: body.compare?.old?.scope_ids?.length ?? null,
        newScopes: body.compare?.new?.scope_ids?.length ?? null,
        provenance: body.provenance?.says ?? null,
      });
    }
  });
  for (let i = 0; i < PICKS.length; i++) {
    const row = columns(page).nth(i).locator("button[aria-pressed]", { hasText: PICKS[i] }).first();
    await until(`${PICKS[i]} row`, async () => (await row.count()) > 0, 120000);
    await row.click();
  }
  await until("compare tabs", async () => (await page.locator("[data-compare-tabs]").count()) > 0, 180000);
  await until("type preview answered", async () => previews.some((p) => p.sent?.selection?.scope_type_id && !p.sent?.selection?.scope_id), 180000);
  await page.waitForTimeout(1500);
  report.fullPath = new URL(page.url()).search;
  const typePreview = previews.filter((p) => p.sent?.selection?.scope_type_id && !p.sent?.selection?.scope_id).at(-1);
  report.typePreview = {
    ...typePreview,
    todayActive: (typePreview?.todayActive ?? "").slice(0, 900),
    compareScopeCount: typePreview?.compareScopeIds?.length ?? null,
  };

  await tab("selection");
  report.selectionTab = await page.evaluate(() => ({
    says: document.querySelector('[data-provenance="selection"]')?.textContent ?? null,
    sent: document.querySelector('[data-selection-block="sent"] pre')?.textContent ?? null,
    arguments: document.querySelector('[data-selection-block="arguments"] pre')?.textContent ?? null,
    compareSelection: document.querySelector('[data-selection-block="expanded"] pre')?.textContent ?? null,
  }));
  await page.locator("[data-compare-tabs]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${shot++}-diff2-type-selection-1600.png`, fullPage: true });

  await tab("today");
  report.todayTab = await page.evaluate(() => ({
    scopeCountLine: [...document.querySelectorAll("[data-compare-side] span")].map((el) => (el.textContent ?? "").trim()).filter((t) => /scope/.test(t)),
    active: (document.querySelector('[data-fed-block="active"] pre')?.textContent ?? "").slice(0, 900),
  }));
  await page.locator("[data-compare-tabs]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${shot++}-diff2-type-today-1600.png`, fullPage: true });

  // ── 2. Answer on both paths, admin's own Quick Test Agent, on the same type pick.
  if (process.env.SKIP_ANSWER) throw new Error("SKIP_ANSWER: stopped before the answer (a before-deploy read)");
  where = "answer-both";
  await open(`${report.fullPath}&agent=${QUICK_TEST_AGENT}`);
  const box = page.locator("[data-answer-both] textarea");
  await until("question box", async () => (await box.count()) > 0, 180000);
  const answered = page.waitForResponse((r) => r.url().includes("answer-both") && r.request().method() === "POST", { timeout: 300000 });
  await box.fill("Which clients am I working with right now, and what is Meridian Risk Services' contact phone?");
  await page.getByRole("button", { name: "Answer on both paths" }).click();
  const res = await answered;
  const body = await res.json().catch(() => ({}));
  report.answerBoth = {
    status: res.status(),
    says: body.says ?? null,
    answers: (body.answers ?? []).map((a) => ({
      path: a.path,
      error: a.error ?? null,
      systemBytes: a.system_byte_length ?? null,
      contextSha: a.context_sha256 ?? null,
      provenance: a.provenance?.says ?? null,
      provenanceFunction: a.provenance ? `${a.provenance.module}.${a.provenance.function}` : null,
      text: (a.answer ?? "").slice(0, 400),
    })),
  };
  await until("two answers", async () => (await page.locator("[data-answer-path] [data-answer-markdown]").count()) === 2, 120000);
  await page.waitForTimeout(1500);
  report.answerBoth.onScreen = await page.evaluate(() => ({
    says: [...document.querySelectorAll("[data-answer-both] p")].map((el) => (el.textContent ?? "").trim()).filter((t) => /assemble_turn_context/.test(t)),
    provenanceLines: [...document.querySelectorAll("[data-answer-provenance]")].map((el) => (el.textContent ?? "").trim().slice(0, 400)),
  }));
  await page.locator("[data-answer-both]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${shot++}-diff2-answer-both-1600.png`, fullPage: true });
} catch (error) {
  report.error = String(error).split("\n")[0].slice(0, 400);
  report.failedAt = where;
  await page.screenshot({ path: `${OUT}/${shot++}-diff2-failure.png`, fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
  report.consoleErrorCount = Object.values(report.consoleErrors).reduce((n, list) => n + list.length, 0);
  writeFileSync(`${OUT}/${first}-diff2-walk-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
