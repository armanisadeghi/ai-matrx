// LANE INSPECTOR-TAILS — headless proof on the shared preview of VERIFIER-22's tails on the context
// inspector: (1) the cold screen shows nothing past Organizations and no sentence claims a pick;
// (2) at 390 px the column being worked in is readable and every row carries its full name;
// (3) "Answer on both paths" renders both answers as markdown (one run on admin's own Quick Test
// Agent: tools off, neither run saved — the endpoint's own contract); (5) the record-store side's
// time for the largest type admin can read (AI Matrx → Features), read off the live compare.
// Read-only otherwise: every click is a selection.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/context-inspector-tails-walk.mjs <outDir> [firstShotNumber]
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.INSPECTOR_ORIGIN ?? "http://inspector-tails.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
let shot = Number(process.argv[3] ?? 22);
mkdirSync(OUT, { recursive: true });
const PATH = "/administration/scopes-context/context-inspector";
const AI_MATRX = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const FEATURES = "36c07712-b0f2-43f2-a1c8-712ae4a75739";
const QUICK_TEST_AGENT = "92c37a37-7630-4517-b2a2-b6f1d2427208";
const PICKS = ["Castellano & Reyes, LLP", "Clients", "Meridian Risk Services", "Contact Phone"];

const browser = await chromium.launch({ headless: true });
const report = { origin: ORIGIN, consoleErrors: {}, timings: [] };
let where = "sign-in";
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") (report.consoleErrors[where] ??= []).push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => (report.consoleErrors[where] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
const columns = (p) => p.locator("[data-context-inspector] .min-w-\\[560px\\] > div");
const colText = (p, n) => columns(p).nth(n).innerText();
const open = async (p, query = "") => {
  await p.goto(`${ORIGIN}${PATH}${query}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await p.waitForSelector("[data-context-inspector] button[aria-pressed]", { timeout: 240000 });
  const dismiss = p.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) await dismiss.click();
};
try {
  // A shared dev server compiles the sign-in path on first use and can outlast the helper's
  // 60-second wait; the next attempt meets a compiled route. Bounded, and said in the report.
  for (let attempt = 1; ; attempt++) {
    try {
      report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
      report.signInAttempts = attempt;
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
    }
  }

  // ── 1. The cold screen. ──
  where = "cold";
  await open(page);
  report.cold = {
    columns: await Promise.all([0, 1, 2, 3].map((n) => colText(page, n))),
    rowsPastOrganizations: await columns(page).nth(1).locator("button[aria-pressed]").count(),
    mentionsSelected: /selected/i.test(await page.locator("[data-context-inspector]").innerText()),
  };
  await page.screenshot({ path: `${OUT}/${shot++}-tails-cold-1600.png`, fullPage: true });

  // ── One pick: the next column fills, the ones after it wait. ──
  where = "one-pick";
  await columns(page).nth(0).locator("button[aria-pressed]", { hasText: PICKS[0] }).first().click();
  await until("types", async () => (await columns(page).nth(1).locator("button[aria-pressed]").count()) > 0, 60000);
  report.afterOrg = { scopeColumn: await colText(page, 2), itemsColumn: await colText(page, 3) };
  await page.screenshot({ path: `${OUT}/${shot++}-tails-org-picked-1600.png`, fullPage: true });
  for (let i = 1; i < PICKS.length; i++) {
    const row = columns(page).nth(i).locator("button[aria-pressed]", { hasText: PICKS[i] }).first();
    await until(`${PICKS[i]} row`, async () => (await row.count()) > 0, 120000);
    await row.click();
  }
  await until("value", async () => (await page.locator("[data-inspector-value]").getAttribute("data-inspector-value").catch(() => null)) || null, 60000);
  const fullPath = page.url().replace(ORIGIN, "");
  report.fullPath = fullPath;

  // ── 3. Answer on both paths, rendered as markdown. ──
  where = "answer-both";
  await open(page, `${fullPath}&agent=${QUICK_TEST_AGENT}`);
  const box = page.locator("[data-answer-both] textarea");
  await until("question box", async () => (await box.count()) > 0, 120000);
  await box.fill("What is the best phone number to reach Meridian Risk Services, and who is their primary contact? Answer with a bold label.");
  await page.getByRole("button", { name: "Answer on both paths" }).click();
  await until("two answers", async () => (await page.locator("[data-answer-path] [data-answer-markdown]").count()) === 2, 180000);
  await page.waitForTimeout(1500);
  report.answers = await page.evaluate(() => [...document.querySelectorAll("[data-answer-path]")].map((el) => ({
    path: el.getAttribute("data-answer-path"),
    rawAsterisks: /\*\*/.test(el.querySelector("[data-answer-markdown]")?.textContent ?? ""),
    boldElements: el.querySelectorAll("[data-answer-markdown] strong, [data-answer-markdown] b").length,
    text: (el.querySelector("[data-answer-markdown]")?.textContent ?? "").slice(0, 240),
  })));
  await page.locator("[data-answer-both]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${shot++}-tails-answers-markdown-1600.png`, fullPage: true });

  // ── 5. The record store's time on the largest type (AI Matrx → Features), three loads. ──
  where = "timing";
  for (let i = 0; i < 3; i++) {
    const started = Date.now();
    const waitFor = page.waitForResponse((r) => r.url().includes("/ai/context/preview") && !r.url().includes("answer-both") && r.request().method() === "POST", { timeout: 180000 });
    await page.goto(`${ORIGIN}${PATH}?org=${AI_MATRX}&scopeType=${FEATURES}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    const res = await waitFor;
    const body = await res.json().catch(() => ({}));
    const c = body.compare ?? {};
    report.timings.push({
      scopes: (c.selection?.scope_ids ?? []).length,
      oldMs: c.old?.resolve_ms ?? null,
      newMs: c.new?.resolve_ms ?? null,
      roundTripMs: Date.now() - started,
    });
  }
  await until("compare shown", async () => (await page.locator("[data-compare-side]").count()) >= 2, 120000);
  await page.screenshot({ path: `${OUT}/${shot++}-tails-features-timing-1600.png`, fullPage: true });

  // ── 2. Phone width: the full Castellano path. ──
  where = "390";
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await context.storageState() })).newPage();
  phone.on("pageerror", (e) => (report.consoleErrors["390"] ??= []).push(`pageerror: ${String(e).slice(0, 300)}`));
  await open(phone, fullPath);
  await until("items at 390", async () => (await columns(phone).nth(3).locator("button[aria-pressed]").count()) > 0, 120000);
  await phone.waitForTimeout(800);
  report.phone = await phone.evaluate(() => {
    const cols = [...document.querySelectorAll("[data-context-inspector] .min-w-\\[560px\\] > div")];
    const scroller = cols[0]?.parentElement?.parentElement;
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      columnWidths: cols.map((c) => Math.round(c.getBoundingClientRect().width)),
      focused: cols.findIndex((c) => c.hasAttribute("data-miller-focused")),
      scrollerLeft: scroller?.scrollLeft ?? null,
      itemRows: [...cols[3].querySelectorAll("button[aria-pressed]")].map((b) => ({
        shown: b.querySelector("span.truncate")?.textContent,
        title: b.getAttribute("title"),
        truncated: (() => { const s = b.querySelector("span.truncate"); return s ? s.scrollWidth > s.clientWidth : null; })(),
      })),
    };
  });
  await phone.screenshot({ path: `${OUT}/${shot++}-tails-390-full-path.png`, fullPage: true });
  await open(phone);
  await phone.screenshot({ path: `${OUT}/${shot++}-tails-390-cold.png`, fullPage: true });
} catch (error) {
  report.error = String(error).split("\n")[0].slice(0, 400);
  report.failedAt = where;
  await page.screenshot({ path: `${OUT}/${shot++}-tails-failure.png`, fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
  writeFileSync(`${OUT}/22-tails-walk-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
