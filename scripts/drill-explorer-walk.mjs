// scripts/drill-explorer-walk.mjs — lane DRILL-EXPLORER (program DRILL-FINISH, 2026-09-30).
//
// Two walks, headless, screenshots + walk-<part>.json into the for-arman folder:
//
//   PART=package  the design-system demo page `drill-answer-proof.html` (the package's own
//                 source): the Pareto line (sentence, markers, the line under the cut only while
//                 the table reads largest first), each group's Copy menu, ticks and one Copy for
//                 AI of the ticked groups, 390 px, dark.
//                   DEMO=http://127.0.0.1:3046 PART=package node scripts/drill-explorer-walk.mjs
//                 (start the demo: cd aidream/apps/shared/design-system && DESIGN_SYSTEM_DEMO_PORT=3046 pnpm demo)
//
//   PART=app      /administration/usage on the shared preview as admin@admin.com through the
//                 login form — the page is now a thin mount of components/official/drill-explorer:
//                 default screen, drill a person, regroup by model, window change, Back, a Saved
//                 view opened (read-only: nothing is saved on live), 390 px, dark.
//                   ORIGIN=http://drillexplorer.localhost:3001 PART=app node scripts/drill-explorer-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const PART = process.env.PART ?? "app";
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-30/drill-explorer";
mkdirSync(SHOTS, { recursive: true });
const out = { part: PART, started: new Date().toISOString(), steps: [], console_errors: [], frictions: [] };
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 400));
};
const shot = async (page, name) => page.screenshot({ path: `${SHOTS}/${PART}-${name}.png`, fullPage: false });

const browser = await chromium.launch({ headless: true });

async function packageWalk() {
  const DEMO = process.env.DEMO ?? "http://127.0.0.1:3046";
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: DEMO });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 300)));
  await page.goto(`${DEMO}/drill-answer-proof.html`, { waitUntil: "load" });
  await page.waitForSelector("[data-matrx-drill-answer]");
  const pareto = await page.locator("[data-matrx-drill-pareto]").textContent();
  const members = await page.locator("[data-matrx-drill-pareto-member]").count();
  const lineAt = await page.evaluate(() => [...document.querySelectorAll("tbody tr")].findIndex((tr) => tr.hasAttribute("data-matrx-drill-pareto-line")));
  step("pareto by provider", { pareto, members, lineAt });
  if (!pareto?.includes("of Cost")) friction("no Pareto sentence");
  await shot(page, "01-pareto-by-provider");

  await page.click('[data-proof="by-model"]');
  await page.waitForTimeout(200);
  step("pareto by model", { pareto: await page.locator("[data-matrx-drill-pareto]").textContent(), members: await page.locator("[data-matrx-drill-pareto-member]").count() });
  await shot(page, "02-pareto-by-model");

  // sort by name: markers stay, no line
  await page.click('[data-matrx-drill-sort="label"]');
  await page.waitForTimeout(200);
  const lineAfterSort = await page.locator("[data-matrx-drill-pareto-line]").count();
  step("sorted by name — no line", { lineAfterSort, members: await page.locator("[data-matrx-drill-pareto-member]").count() });
  if (lineAfterSort !== 0) friction("the Pareto line was drawn over a table not ordered by the Measure");
  await shot(page, "03-pareto-sorted-by-name");

  // back to provider, costliest first; open one row's Copy menu, copy the row as text
  await page.click('[data-proof="by-provider"]');
  await page.click('[data-matrx-drill-sort="cost"]');
  await page.waitForTimeout(200);
  const firstCopy = page.locator("[data-matrx-drill-row-copy] button").first();
  await firstCopy.click();
  await page.waitForTimeout(300);
  await shot(page, "04-row-copy-menu");
  const plain = page.getByRole("button", { name: /Copy Plain text/i }).first();
  if (await plain.count()) {
    await plain.click();
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    step("row copied as text", { clip });
    if (!clip?.includes("Provider: Anthropic")) friction("the row's copy did not carry the group");
  } else friction("the row Copy menu has no plain-text copy");
  await page.keyboard.press("Escape");

  // tick two providers, the selection's Copy for AI
  const ticks = page.locator("[data-matrx-drill-tick]");
  await ticks.nth(0).check();
  await ticks.nth(2).check();
  const selection = await page.locator("[data-matrx-drill-selection]").textContent();
  step("two groups ticked", { selection });
  await page.locator("[data-matrx-drill-selection] button").first().click();
  await page.waitForTimeout(300);
  await shot(page, "05-selection-copy-menu");
  const ai = page.getByRole("button", { name: /Copy for AI|Copy AI/i }).first();
  if (await ai.count()) {
    await ai.click();
    await page.waitForTimeout(400);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    step("selection copied for AI", { head: clip?.slice(0, 200), hasBoth: Boolean(clip?.includes("Anthropic") && clip?.includes("Google")) });
    if (!(clip?.includes("Anthropic") && clip?.includes("Google"))) friction("the selection's AI copy did not carry both groups");
  } else step("no direct Copy-for-AI button in the menu (menu shape)", { buttons: await page.locator("[role=menu] button, [role=dialog] button").allTextContents() });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  step("390 px", { sideways });
  await shot(page, "06-phone");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`${DEMO}/drill-answer-proof.html?theme=dark`, { waitUntil: "load" });
  await page.waitForSelector("[data-matrx-drill-answer]");
  await shot(page, "07-dark");
  await context.close();
}

/** The shared preview's live walk cap parks a tab when another session needs the slot; resume like a person. */
async function gotoResuming(page, url) {
  for (let n = 1; n <= 8; n += 1) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await sleep(1500);
    const parked = page.url().includes("__dev-walk") || (await page.getByRole("button", { name: /Resume/ }).count()) > 0;
    if (!parked) return;
    console.log(`[walk] parked by the walk cap (try ${n}) — resuming`);
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(5000 * n);
  }
  throw new Error("the walk cap kept parking this tab");
}

async function appWalk() {
  const ORIGIN = process.env.ORIGIN ?? "http://drillexplorer.localhost:3001";
  const readEnv = (p) =>
    Object.fromEntries(
      readFileSync(p, "utf8")
        .split("\n")
        .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
    );
  const env = { ...readEnv(new URL("../../aidream/.env", import.meta.url)), ...readEnv(new URL("../.env.local", import.meta.url)) };
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 300)));
  await gotoResuming(page, `${ORIGIN}/login`);
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  step("signed in", { who });
  if (who !== "admin@admin.com") throw new Error(`signed in as ${who}, not the test seat`);

  const total = async () => (await page.locator("[data-drill-explorer-total]").textContent())?.trim();
  const groups = async () => page.locator("[data-matrx-drill-into]").count();
  const settled = async (label) => {
    await sleep(400);
    const r = await until(label, async () => (await groups()) > 0 && !(await total())?.includes("…"), 90000);
    return r.ms;
  };

  await gotoResuming(page, `${ORIGIN}/administration/usage`);
  const ms = await settled("default screen");
  const parity = await page.evaluate(() => ({
    mount: Boolean(document.querySelector("[data-usage-explorer][data-drill-explorer]")),
    freshness: document.querySelector("[data-drill-explorer-freshness]")?.textContent ?? null,
    recount: Boolean([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Recount")),
    unit: document.querySelectorAll("[data-drill-explorer-unit]").length,
    oldLink: Boolean([...document.querySelectorAll("a")].find((a) => a.textContent?.includes("Old usage page"))),
    header: document.querySelector("[data-drill-explorer-header]")?.textContent?.slice(0, 200) ?? null,
  }));
  step("default screen", { ms, total: await total(), groups: await groups(), ...parity });
  if (!parity.mount) friction("the usage page is not a DrillExplorer mount");
  if (!parity.recount) friction("the Recount button is gone");
  await shot(page, "01-default");

  // drill a person: the first group's words
  const firstPerson = (await page.locator("[data-matrx-drill-into]").first().textContent())?.trim();
  await page.locator("[data-matrx-drill-into]").first().click();
  await settled("drilled a person");
  const afterDrill = { url: page.url().replace(ORIGIN, ""), total: await total(), trail: (await page.locator("[data-matrx-drill-trail], nav[aria-label*=rail]").first().textContent().catch(() => null))?.slice(0, 160), note: (await page.locator("[data-drill-explorer-note]").textContent().catch(() => null))?.slice(0, 300) };
  step("drilled a person", { firstPerson, ...afterDrill });
  if (!afterDrill.url.includes("f.person")) friction("a click on a person did not narrow to that person");
  if (!afterDrill.note?.includes("This slice is")) friction("the coverage sentence is missing after a drill");
  await shot(page, "02-drilled-person");

  // regroup by model: through the Group by menu
  const url = new URL(page.url());
  url.searchParams.set("by", "model");
  await gotoResuming(page, url.toString());
  await settled("regrouped by model");
  step("regrouped by model", { url: page.url().replace(ORIGIN, ""), groups: await groups(), first: (await page.locator("[data-matrx-drill-into]").first().textContent())?.trim() });
  await shot(page, "03-by-model");

  // window change through the Window menu
  const before = await total();
  await page.locator("[data-matrx-drill-window]").first().click();
  await page.locator('[data-matrx-drill-window-option="7d"]').first().click();
  await until("window 7d", async () => page.url().includes("w=7d"), 20000);
  await settled("window 7d");
  step("window changed to 7 days", { url: page.url().replace(ORIGIN, ""), before, after: await total() });
  if (!page.url().includes("w=7d")) friction("the Window menu did not change the window");
  await shot(page, "04-window-7d");

  // Back
  await page.goBack();
  await settled("back");
  step("Back", { url: page.url().replace(ORIGIN, ""), total: await total() });
  if (page.url().includes("w=7d")) friction("Back did not undo the window change");
  await shot(page, "05-back");

  // Saved views menu: open the first view if any (built-in first); never save on live
  await page.locator("[data-drill-explorer-saved-views]").click();
  await page.waitForTimeout(800);
  const menu = await page.locator("[role=menu]").first().textContent().catch(() => null);
  const firstView = page.locator("[data-drill-explorer-view]").first();
  const viewCount = await page.locator("[data-drill-explorer-view]").count();
  step("Saved views menu", { menu: menu?.slice(0, 300), views: viewCount });
  await shot(page, "06-saved-views-menu");
  if (viewCount > 0) {
    const name = (await firstView.textContent())?.trim();
    await firstView.click();
    await settled("opened a saved view");
    step("opened a Saved view", { name, url: page.url().replace(ORIGIN, ""), total: await total() });
    await shot(page, "07-saved-view-open");
  } else {
    await page.keyboard.press("Escape");
    step("no Saved view to open on this seat (none saved, none declared yet)");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoResuming(page, `${ORIGIN}/administration/usage`);
  await settled("phone");
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  step("390 px", { sideways });
  if (sideways) friction("the page scrolls sideways at 390 px");
  await shot(page, "08-phone");

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(500);
  await shot(page, "09-dark");
  await context.close();
}

try {
  if (PART === "package") await packageWalk();
  else await appWalk();
} catch (e) {
  friction(`walk stopped: ${e.message}`);
} finally {
  await browser.close();
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk-${PART}.json`, JSON.stringify(out, null, 2));
  console.log(`\n${out.frictions.length} frictions, ${out.console_errors.length} console errors → ${SHOTS}/walk-${PART}.json`);
}
