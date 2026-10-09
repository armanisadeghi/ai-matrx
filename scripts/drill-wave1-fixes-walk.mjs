// scripts/drill-wave1-fixes-walk.mjs — lane DRILL-WAVE1-FIXES (2026-09-30).
//
// Headless walks of the VERIFY-DRILL-WAVE1 fixes; screenshots + walk-<part>.json into the evidence folder (/tmp/matrx-evidence).
//
//   PART=package  the design-system demo `drill-wave1-proof.html` (package SOURCE): a pivot across
//                 days in calendar order, capped by the host prop (`?cap=`), the rest column first and
//                 its sentence (F2, F7); the page never scrolls sideways at 390 (F8); the window menu's
//                 All time / Today / Yesterday / Custom range (F6). 1280 and 390, light and dark.
//                   DEMO=http://127.0.0.1:3001 PART=package node scripts/drill-wave1-fixes-walk.mjs
//                 (start: cd aidream/apps/shared/design-system && DESIGN_SYSTEM_DEMO_PORT=3049 pnpm demo)
//
//   PART=app      /administration/usage on the shared preview (read-only, admin@admin.com): the
//                 header at 390 (F1), the coverage line agrees with the header (F5), the Cost
//                 column's unit word matches its cells (F9), a pivot across days (F2's door half).
//                   ORIGIN=http://drillfix.localhost:3001 PART=app node scripts/drill-wave1-fixes-walk.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { signIn, sleep } from "./lib/seat-browser.mjs";

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

const PART = process.env.PART ?? "app";
const SHOTS = process.env.SHOTS ?? "/tmp/matrx-evidence/2026-09-30/drill-wave1-fixes";
mkdirSync(SHOTS, { recursive: true });
const out = { part: PART, started: new Date().toISOString(), steps: [], console_errors: [], frictions: [] };
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 500));
};
const shot = async (page, name) => page.screenshot({ path: `${SHOTS}/${PART}-${name}.png`, fullPage: false });
const browser = await chromium.launch({ headless: true });

async function packageWalk() {
  const DEMO = process.env.DEMO ?? "http://127.0.0.1:3001";
  for (const theme of ["light", "dark"]) {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 860 } });
      const page = await context.newPage();
      page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 300)));
      await page.goto(`${DEMO}/drill-wave1-proof.html?cap=7${theme === "dark" ? "&theme=dark" : ""}`, { waitUntil: "load" });
      await page.waitForSelector("[data-matrx-drill-answer]");
      const heads = await page.$$eval("[data-matrx-drill-pivot-column]", (ths) => ths.map((th) => th.textContent));
      const says = await page.locator("[data-matrx-drill-pivot-says]").textContent().catch(() => null);
      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const box = await page.evaluate(() => {
        const el = document.querySelector("[data-matrx-drill-answer-scroll]");
        return el ? { client: el.clientWidth, scroll: el.scrollWidth } : null;
      });
      step(`${theme} ${width}: pivot across days, cap 7`, { heads, says, pageWidth, box });
      if (JSON.stringify(heads) !== JSON.stringify(["23 earlier", "Sep 24, 2026", "Sep 25, 2026", "Sep 26, 2026", "Sep 27, 2026", "Sep 28, 2026", "Sep 29, 2026", "Sep 30, 2026"])) friction(`${theme} ${width}: columns not the latest 7 in calendar order after one rest column`);
      if (!says?.includes("Showing the latest 7 of 30 periods")) friction(`${theme} ${width}: no sentence for the rest column`);
      if (pageWidth > width) friction(`${theme} ${width}: the page scrolls sideways (${pageWidth})`);
      if (!box || box.scroll <= box.client) friction(`${theme} ${width}: the answer does not scroll inside itself`);
      await shot(page, `${theme}-${width}-pivot`);
      if (theme === "light" && width === 1280) {
        await page.click("[data-matrx-drill-window]");
        await page.waitForTimeout(200);
        const options = await page.$$eval("[data-matrx-drill-window-option]", (els) => els.map((e) => e.textContent));
        step("window menu", { options });
        if (!["All time", "Today", "Yesterday", "Custom range…"].every((o) => options.includes(o))) friction("the window menu lacks the old screens' windows");
        await shot(page, "window-menu");
        await page.click('[data-matrx-drill-window-option="yesterday"]');
        await page.waitForTimeout(200);
        step("yesterday", { label: await page.locator("[data-proof-window]").textContent(), range: await page.locator("[data-proof-range]").textContent() });
        await page.click("[data-matrx-drill-window]");
        await page.waitForTimeout(200);
        await page.click('[data-matrx-drill-window-option="custom"]');
        await page.waitForSelector("[data-matrx-drill-window-from]", { timeout: 3000 }).catch(() => friction("Custom range opened no form"));
        await page.fill("[data-matrx-drill-window-from]", "2026-09-28T09:00");
        await page.fill("[data-matrx-drill-window-to]", "2026-09-28T17:30");
        await page.waitForTimeout(600);
        await shot(page, "window-custom-form");
        await page.click("[data-matrx-drill-window-apply]");
        await page.waitForTimeout(200);
        const label = await page.locator("[data-proof-window]").textContent();
        step("custom range applied", { label, range: await page.locator("[data-proof-range]").textContent(), button: await page.locator("[data-matrx-drill-window]").textContent() });
        if (!label?.includes("Sep 28, 2026")) friction("custom range did not apply");
        await shot(page, "window-custom-applied");
      }
      await context.close();
    }
  }
}

async function appWalk() {
  const ORIGIN = process.env.ORIGIN ?? "http://drillfix.localhost:3001";
  const env = ["/Users/armanisadeghi/code/matrx-frontend/.env", "/Users/armanisadeghi/code/matrx-frontend/.env.local"].map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
  const val = (k) => env.match(new RegExp(`^${k}=["']?([^"'\\n]+)`, "m"))?.[1];
  for (const theme of ["light", "dark"]) {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      const page = await context.newPage();
      page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 300)));
      await gotoResuming(page, `${ORIGIN}/login`);
      const who = await signIn(page, ORIGIN, val("AI_ADMIN_USERNAME"), val("AI_ADMIN_PASSWORD"), "admin");
      if (theme === "light" && width === 1280) step("signed in", { who });
      await page.goto(`${ORIGIN}/administration/usage`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForFunction(() => /\d/.test(document.querySelector("[data-drill-explorer-total]")?.textContent ?? ""), null, { timeout: 180000 });
      await page.waitForSelector("[data-matrx-drill-answer]", { timeout: 120000 });
      const header = await page.evaluate(() => {
        const h1 = document.querySelector("[data-drill-explorer-header] h1");
        const total = document.querySelector("[data-drill-explorer-total]");
        const lines = (el) => (el ? Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || "20")) : 0);
        const top = (el) => el?.getBoundingClientRect().top ?? 0;
        return { title: h1?.textContent, titleLines: lines(h1), total: total?.textContent, totalLines: lines(total), sameRow: Math.abs(top(h1) - top(total)) < 20, pageWidth: document.documentElement.scrollWidth };
      });
      const costHead = await page.$$eval("[data-matrx-drill-sort]", (els) => els.map((e) => e.textContent).find((t) => t?.startsWith("Cost")));
      const firstCell = await page.evaluate(() => document.querySelector("[data-matrx-drill-answer] tbody td:nth-child(2)")?.textContent ?? null);
      step(`${theme} ${width}: header`, { header, costHead, firstCell });
      if (header.titleLines > 1) friction(`${theme} ${width}: the title breaks across lines`);
      if (header.totalLines > 1) friction(`${theme} ${width}: the total breaks across lines`);
      if (!header.sameRow) friction(`${theme} ${width}: title and total are not on one line`);
      if (header.pageWidth > width) friction(`${theme} ${width}: the page scrolls sideways (${header.pageWidth})`);
      const unitHead = costHead?.match(/\((\w+)\)/)?.[1];
      if (unitHead && firstCell && !firstCell.includes(unitHead)) friction(`${theme} ${width}: the Cost column says ${unitHead} but its cells say "${firstCell}"`);
      await shot(page, `${theme}-${width}-default`);
      if (theme === "light" && width === 1280) {
        // drill the first person: the coverage line and the header agree
        await page.locator("[data-matrx-drill-into]").first().click();
        await page.waitForFunction(() => document.querySelector("[data-drill-explorer-coverage]"), null, { timeout: 120000 });
        await page.waitForTimeout(1500);
        const coverage = await page.locator("[data-drill-explorer-coverage]").textContent();
        step("drilled: coverage", { coverage, total: await page.locator("[data-drill-explorer-total]").textContent() });
        await shot(page, "drilled-coverage");
        await page.goBack();
        await page.waitForTimeout(1500);
        const wholeTotal = await page.locator("[data-drill-explorer-total]").textContent();
        const n = (s) => s?.match(/[\d,]{4,}/g)?.map((x) => x.replace(/,/g, "")) ?? [];
        step("back: header total", { wholeTotal });
        if (n(coverage).length >= 2 && n(wholeTotal)[0] !== n(coverage)[1]) friction(`the coverage's whole ${n(coverage)[1]} is not the header's ${n(wholeTotal)[0]}`);
        // a pivot across days
        await page.goto(`${ORIGIN}/administration/usage?by=provider&across=at:day&show=cost&w=30d`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-matrx-drill-pivot-column]", { timeout: 180000 });
        await page.waitForTimeout(1500);
        const heads = await page.$$eval("[data-matrx-drill-pivot-column]", (ths) => ths.map((th) => th.textContent));
        step("pivot by provider across days (30 d)", { heads });
        await shot(page, "pivot-across-days");
      }
      await context.close();
    }
  }
}

try {
  if (PART === "package") await packageWalk();
  else await appWalk();
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(`${SHOTS}/walk-${PART}.json`, JSON.stringify(out, null, 2));
  console.log(`frictions: ${out.frictions.length}, console errors: ${out.console_errors.length}`);
  await browser.close();
}
