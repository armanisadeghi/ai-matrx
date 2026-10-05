// scripts/assists/assists-dock-cost-walk.mjs — LANE ASSISTS-DOCK-COST (2026-10-01)
//
// WHAT THE ASSISTS DOCK'S PLACEMENT PASS COSTS while a person types a search on the data home and
// while they scroll a list, from a real seat (headless, 1440x900). Reads the dock's own
// `assists-dock:pass` performance measures (features/assists/assistClearance.ts) and counts every
// `elementsFromPoint` / `getBoundingClientRect` call on the page during each phase.
//
//   WALK_ORIGIN=http://<you>.localhost:3001 WALK_EMAIL=… WALK_PASSWORD=… [WALK_PATH=/agents/all] \
//     [WALK_ONLY=search,scroll] node scripts/assists/assists-dock-cost-walk.mjs
//
// Credentials come from the environment and are never printed. Read-only: it types into the
// search box and scrolls; nothing is written.
import { chromium } from "playwright";

import { signIn, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN;
const EMAIL = process.env.WALK_EMAIL;
const PASSWORD = process.env.WALK_PASSWORD;
const PATH = process.env.WALK_PATH ?? "/data";
const ONLY = (process.env.WALK_ONLY ?? "search,scroll").split(",");
if (!ORIGIN || !EMAIL || !PASSWORD) throw new Error("WALK_ORIGIN, WALK_EMAIL and WALK_PASSWORD must be set");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  const counts = { efp: 0, gbcr: 0 };
  window.__dockCost = counts;
  const efp = Document.prototype.elementsFromPoint;
  Document.prototype.elementsFromPoint = function (...a) {
    counts.efp += 1;
    return efp.apply(this, a);
  };
  const gbcr = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    counts.gbcr += 1;
    return gbcr.call(this);
  };
});
const page = await context.newPage();
const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, "admin");
console.log(`identity matches seat: ${who === EMAIL}`);

const begin = () =>
  page.evaluate(() => {
    performance.clearMeasures("assists-dock:pass");
    window.__dockCost.efp = 0;
    window.__dockCost.gbcr = 0;
  });
const end = (label, steps) =>
  page.evaluate(
    ({ label, steps }) => {
      const passes = performance.getEntriesByName("assists-dock:pass").map((e) => e.duration);
      passes.sort((a, b) => b - a);
      const total = passes.reduce((a, b) => a + b, 0);
      return {
        label,
        steps,
        passes: passes.length,
        passTotalMs: Math.round(total),
        passMaxMs: Math.round((passes[0] ?? 0) * 10) / 10,
        passMedianMs: Math.round((passes[Math.floor(passes.length / 2)] ?? 0) * 10) / 10,
        elementsFromPoint: window.__dockCost.efp,
        getBoundingClientRect: window.__dockCost.gbcr,
      };
    },
    { label, steps },
  );

try {
  await page.goto(`${ORIGIN}${PATH}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await until("rows", async () => (await page.locator("[data-row-id]:visible").count()) > 0, 180000);
  await page.waitForSelector("[data-assists-dock]", { state: "attached", timeout: 60000 }).catch(() => {});
  await sleep(3000);
  const dockShown = await page.evaluate(() =>
    [...document.querySelectorAll("[data-assists-dock]")].some((d) => d.getBoundingClientRect().width > 0),
  );
  console.log(`dock visible: ${dockShown}`);

  if (ONLY.includes("search")) {
    const box = page.locator("[data-entity-list-search]:visible").first();
    await box.click();
    await begin();
    let steps = 0;
    for (const word of ["Loaner", "Exercize", "intake", "Service"]) {
      await box.fill("");
      await sleep(400);
      for (const ch of word) {
        await page.keyboard.type(ch);
        steps += 1;
        await sleep(90);
      }
      await sleep(600);
    }
    await sleep(800);
    console.log(JSON.stringify(await end(`search ${PATH}`, steps)));
    await box.fill("");
    await sleep(1500);
  }

  if (ONLY.includes("scroll")) {
    await begin();
    const steps = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const rows = [...document.querySelectorAll("[data-row-id]")].filter((e) => e.getBoundingClientRect().height > 0);
      let el = rows[0];
      while (el && !(el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      if (!el) return 0;
      let n = 0;
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 10; i++) {
          el.scrollTop += 120;
          n += 1;
          await wait(50);
        }
        await wait(400); // the person pauses
        for (let i = 0; i < 10; i++) {
          el.scrollTop -= 120;
          n += 1;
          await wait(50);
        }
        await wait(400);
      }
      return n;
    });
    await sleep(500);
    console.log(JSON.stringify(await end(`scroll ${PATH}`, steps)));
  }
} finally {
  await browser.close();
}
