// LANE CONTEXT-INSPECTOR-GUIDED — headless proof on the shared preview that the context
// inspector is one ordered drill-down: Organization → Scope type → Scope → Context item, the
// old-vs-new compare re-resolving at each step, the address carrying the selection, and an old
// `?scope=<id>` link back-filling its organization and type. Read-only: nothing is written.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed).
// Usage: node scripts/context-inspector-walk.mjs <outDir>
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
const OUT = process.argv[2] ?? "/tmp";
mkdirSync(OUT, { recursive: true });
const PATH = "/administration/scopes-context/context-inspector";
const STEPS = [
  { step: "org", label: "Organization", choose: "Castellano & Reyes, LLP" },
  { step: "scopeType", label: "Scope type", choose: "Clients" },
  { step: "scope", label: "Scope", choose: "Meridian Risk Services", search: "Meridian" },
  { step: "item", label: "Context item", choose: "Contact Phone" },
];

const browser = await chromium.launch({ headless: true });
const report = { steps: [], consoleErrors: [] };
try {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}${PATH}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-inspector-row]", { timeout: 240000 });
  report.consoleErrors.length = 0; // errors from sign-in pages are not this page's
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) await dismiss.click();

  const compareText = () => page.evaluate(() =>
    [...document.querySelectorAll("[data-compare-side]")].map((el) => el.textContent ?? "").join("\n---\n"));
  let previous = await compareText();
  let n = 0;
  for (const s of STEPS) {
    n += 1;
    const trigger = page.locator(`[data-inspector-step="${s.step}"] button[role="combobox"]`);
    await until(`${s.step} enabled`, async () => await trigger.isEnabled(), 60000);
    await trigger.click();
    if (s.search) await page.keyboard.type(s.search);
    await page.getByRole("option", { name: new RegExp(s.choose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    // The compare remounts (skeleton) and re-resolves; wait for its sides and for them to differ.
    const { v: settled, ms } = await until(`${s.step} preview`, async () => {
      const sides = await page.locator("[data-compare-side]").count();
      const err = await page.locator("text=Comparison unavailable").count();
      if (err) return "error";
      if (sides < 2) return null;
      const now = await compareText();
      return s.step === "item" || now !== previous ? now : null;
    }, 180000);
    const text = settled === "error" ? await page.locator("[data-context-compare]").innerText() : settled;
    report.steps.push({
      step: s.step,
      chose: s.choose,
      url: page.url().replace(ORIGIN, ""),
      previewMs: ms,
      previewChanged: typeof text === "string" && text !== previous,
      caption: await page.locator("[data-inspector-caption]").first().innerText().catch(() => null),
      value: await page.locator("[data-inspector-value]").getAttribute("data-inspector-value").catch(() => null),
      focus: await page.locator("[data-compare-focus]").count(),
      preview: typeof text === "string" ? text.slice(0, 600) : null,
    });
    await page.screenshot({ path: `${OUT}/${n}-${s.step}.png`, fullPage: true });
    previous = text ?? previous;
  }

  // An old shared link: only ?scope=. The scope names its organization and type.
  await page.goto(`${ORIGIN}${PATH}?scope=2ba5cb52-9530-4682-a12c-3ededff23c2c`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const { v: filled } = await until("deep link back-fill", async () => {
    const u = new URL(page.url());
    return u.searchParams.get("org") && u.searchParams.get("scopeType") && (await page.locator("[data-compare-side]").count()) >= 2
      ? u.search : null;
  }, 180000);
  report.deepLink = {
    url: filled,
    pickers: await page.locator("[data-inspector-step] button[role=combobox]").allInnerTexts(),
  };
  await page.screenshot({ path: `${OUT}/5-deep-link.png`, fullPage: true });
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
