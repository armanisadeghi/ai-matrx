// LANE CONTEXT-INSPECTOR-GUIDED (lane 1) + CONTEXT-INSPECTOR-2 — headless proof on the shared
// preview that the context inspector is one ordered drill-down: Organization → Scope type →
// Scope → Context item, the old-vs-new compare re-resolving at each step with ONE selection
// (the server's ContextSelection) on both sides, the type step comparing EVERY scope of the type
// on both sides (no cap), the address carrying the selection, an old `?scope=<id>` link
// back-filling its organization and type, and "Answer on both paths" choosing its agent with the
// agent picker into `?agent=`. Read-only: nothing is written (no question is asked of the agent).
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/context-inspector-walk.mjs <outDir> [firstShotNumber]
//   INSPECTOR_BACKEND=http://localhost:8000 routes the compare's two server calls
//   (/ai/context/preview, /ai/context/preview/answer-both) to a local aidream checkout — how an
//   unreleased server change is walked before the release train carries it.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.INSPECTOR_ORIGIN ?? "http://context-inspector.localhost:3001";
const PROD = (env.NEXT_PUBLIC_BACKEND_URL_PROD ?? "https://server.app.matrxserver.com").replace(/\/$/, "");
const BACKEND = process.env.INSPECTOR_BACKEND?.replace(/\/$/, "") ?? null;
const OUT = process.argv[2] ?? "/tmp";
let shot = Number(process.argv[3] ?? 1);
mkdirSync(OUT, { recursive: true });
const PATH = "/administration/scopes-context/context-inspector";
const STEPS = [
  { step: "org", label: "Organization", choose: "Castellano & Reyes, LLP" },
  { step: "scopeType", label: "Scope type", choose: "Clients" },
  { step: "scope", label: "Scope", choose: "Meridian Risk Services", search: "Meridian" },
  { step: "item", label: "Context item", choose: "Contact Phone" },
];

const browser = await chromium.launch({ headless: true });
const report = { backend: BACKEND ?? PROD, steps: [], consoleErrors: [] };
const previews = []; // every compare request body and what the server echoed back
try {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
  await page.route(`${PROD}/ai/context/preview**`, async (route) => {
    const req = route.request();
    const url = BACKEND ? req.url().replace(PROD, BACKEND) : req.url();
    const response = await route.fetch({ url });
    let body = null;
    try { body = await response.json(); } catch { /* not json */ }
    const sent = (() => { try { return JSON.parse(req.postData() ?? "null"); } catch { return null; } })();
    previews.push({
      path: new URL(url).pathname,
      status: response.status(),
      sentSelection: sent?.selection ?? null,
      sentScopeIds: sent?.scope_ids ?? null,
      echoed: body?.compare?.selection ?? null,
      oldScopes: body?.compare?.old?.scope_ids?.length ?? null,
      newChecks: body?.compare?.new?.checks?.length ?? null,
      error: response.status() >= 400 ? JSON.stringify(body).slice(0, 300) : null,
    });
    await route.fulfill({ response, json: body ?? undefined });
  });
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}${PATH}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-inspector-row]", { timeout: 240000 });
  report.consoleErrors.length = 0; // errors from sign-in pages are not this page's
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) await dismiss.click();

  const compareText = () => page.evaluate(() =>
    [...document.querySelectorAll("[data-compare-side]")].map((el) => el.textContent ?? "").join("\n---\n"));
  let previous = await compareText();
  for (const s of STEPS) {
    const trigger = page.locator(`[data-inspector-step="${s.step}"] button[role="combobox"]`);
    await until(`${s.step} enabled`, async () => await trigger.isEnabled(), 60000);
    await trigger.click();
    if (s.search) await page.keyboard.type(s.search);
    await page.getByRole("option", { name: new RegExp(s.choose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    // The selection this step's address describes — what the compare must have been sent.
    const expected = () => {
      const q = new URL(page.url()).searchParams;
      const order = ["org", "scopeType", "scope", "item"];
      const upTo = order.indexOf(s.step);
      const at = (i, key) => (i <= upTo ? q.get(key) : null);
      return JSON.stringify({
        organization_id: q.get("org"),
        scope_type_id: at(1, "scopeType"),
        scope_id: at(2, "scope"),
        context_item_id: at(3, "item"),
      });
    };
    const answered = () => previews.findLast((p) => JSON.stringify(p.sentSelection) === expected());
    // The compare remounts (skeleton) and re-resolves; wait for THIS step's answer to be on screen.
    const { v: settled, ms } = await until(`${s.step} preview`, async () => {
      const err = await page.locator("text=Comparison unavailable").count();
      if (err) return "error";
      if (!answered() || (await page.locator("[data-compare-side]").count()) < 2) return null;
      const now = await compareText();
      return s.step === "item" || now !== previous ? now : null;
    }, 180000);
    const text = settled === "error" ? await page.locator("[data-context-compare]").innerText() : settled;
    const entry = {
      step: s.step,
      chose: s.choose,
      url: page.url().replace(ORIGIN, ""),
      previewMs: ms,
      previewChanged: typeof text === "string" && text !== previous,
      request: answered() ?? null,
      caption: await page.locator("[data-inspector-caption]").first().innerText().catch(() => null),
      value: await page.locator("[data-inspector-value]").getAttribute("data-inspector-value").catch(() => null),
      focus: await page.locator("[data-compare-focus]").count(),
      sideScopes: await page.locator("[data-compare-side]").evaluateAll((els) =>
        els.map((el) => (el.textContent ?? "").match(/(\d+) scopes?/)?.[0] ?? null)),
      preview: typeof text === "string" ? text.slice(0, 400) : null,
    };
    if (s.step === "scopeType") {
      // The scope step's own list — every Client this person can read — against both sides.
      const scopeTrigger = page.locator('[data-inspector-step="scope"] button[role="combobox"]');
      await scopeTrigger.click();
      entry.scopeOptions = await page.getByRole("option").allInnerTexts();
      await page.keyboard.press("Escape");
    }
    report.steps.push(entry);
    await page.screenshot({ path: `${OUT}/${shot++}-${s.step}.png`, fullPage: true });
    previous = text ?? previous;
  }

  // "Answer on both paths": the agent is chosen with the agent picker, into ?agent=.
  const answer = page.locator("[data-answer-both-needs-agent], [data-answer-both]").first();
  await answer.scrollIntoViewIfNeeded();
  report.answerBefore = await answer.innerText();
  await page.locator("[data-answer-agent] button").first().click();
  const rows = page.locator('[data-testid^="agent-row-"]');
  await until("agent list", async () => (await rows.count()) > 0, 60000);
  await page.screenshot({ path: `${OUT}/${shot++}-agent-picker-open.png`, fullPage: false });
  report.agentRows = await rows.count();
  await rows.first().locator("a").first().click();
  const { v: agentUrl } = await until("?agent= in the address", async () => {
    const u = new URL(page.url());
    return u.searchParams.get("agent") ? u.search : null;
  }, 30000);
  await until("question box", async () => (await page.locator("[data-answer-both] textarea").count()) > 0, 30000);
  report.agent = {
    url: agentUrl,
    picker: await page.locator("[data-answer-agent] button").first().innerText(),
    questionBox: await page.locator("[data-answer-both] textarea").count(),
  };
  await page.locator("[data-answer-both]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${shot++}-agent-chosen.png`, fullPage: true });

  // An old shared link: only ?scope=. The scope names its organization and type.
  await page.goto(`${ORIGIN}${PATH}?scope=2ba5cb52-9530-4682-a12c-3ededff23c2c`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const deepStart = previews.length;
  const { v: filled } = await until("deep link back-fill", async () => {
    const u = new URL(page.url());
    return u.searchParams.get("org") && u.searchParams.get("scopeType") && (await page.locator("[data-compare-side]").count()) >= 2
      ? u.search : null;
  }, 180000);
  report.deepLink = {
    url: filled,
    pickers: await page.locator("[data-inspector-step] button[role=combobox]").allInnerTexts(),
    requests: previews.slice(deepStart),
  };
  await page.screenshot({ path: `${OUT}/${shot++}-deep-link.png`, fullPage: true });
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
