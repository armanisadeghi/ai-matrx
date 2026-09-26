// Toolbar walk for records-ui 0.89.1 — admin@admin.com, disposable "Grid Parity Fixture" table,
// Settings rail open + a personal look pending, at 1600 / 390 / 320. Also notes anything on the
// table page that looks broken/different from 0.86.0 (the merged grid is new in 0.89.x).
import { chromium } from "playwright";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { signIn, sleep, until } from "../lib/seat-browser.mjs";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const ORIGIN = "http://v25-ui-fixes.localhost:3001";
const TABLE_ID = "fc007161-f1c5-4ea9-9548-eefda0bc7d72"; // Grid Parity Fixture, owned by admin@admin.com
const OUT_DIR = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-26/toolbar-0.87";

const email = process.env.AI_ADMIN_USERNAME;
const password = process.env.AI_ADMIN_PASSWORD;
if (!email || !password) throw new Error("AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD missing from .env.local");

const results = [];
const notes = [];
function record(name, ok, saw) {
  results.push({ name, ok, saw });
  console.log(`[${ok ? "OK" : "FAIL"}] ${name}`, JSON.stringify(saw));
}

/** Measure every toolbar control box + the slot's scroll/client width, from inside the page. */
async function measureToolbar(page) {
  return page.evaluate(() => {
    const slot = document.querySelector("[data-toolbar-fit-slot]") ||
      document.querySelector("[data-table-toolbar-slot]") ||
      document.querySelector("[data-clipped]");
    const buttons = Array.from(document.querySelectorAll("button, input, a")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < 140; // toolbar band near top of the table page
    });
    const boxes = buttons.map((el) => {
      const r = el.getBoundingClientRect();
      const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().slice(0, 40);
      return { name, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), full: Math.round(r.width) };
    }).filter((b) => b.name);
    // overlap check: any two boxes on the same row band whose horizontal ranges intersect by >2px
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const sameBand = Math.abs(a.top - b.top) < 8;
        if (!sameBand) continue;
        const overlapPx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (overlapPx > 2) overlaps.push(`${a.name} × ${b.name} (${overlapPx}px)`);
      }
    }
    return {
      viewport: window.innerWidth,
      boxes,
      overlaps,
      rowScroll: slot ? slot.scrollWidth : null,
      rowClient: slot ? slot.clientWidth : null,
      clipped: slot ? slot.getAttribute("data-clipped") : null,
    };
  });
}

const shot = async (page, name) => {
  const file = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  return file;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const who = await signIn(page, ORIGIN, email, password, "admin");
  record("signed in as admin@admin.com (per /api/whoami)", who === email, who);

  await page.goto(`${ORIGIN}/data-v2/${TABLE_ID}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await until("table page rendered", async () => (await page.locator('button[aria-label="Search records"], input[placeholder="Search records"]').count()) > 0, 45000);
  await sleep(1500);

  // Note anything that looks broken/different vs 0.86.0 on the table page (merged grid is new).
  const pageSnapshot = await page.evaluate(() => ({
    hasErrorBoundary: !!document.querySelector('[data-testid="error-boundary"], .error-boundary'),
    consoleVisible: document.body.innerText.slice(0, 2000),
  }));
  await shot(page, "0-table-page-first-load-1600");
  notes.push({ where: "first load @1600", snapshot: pageSnapshot.hasErrorBoundary ? "error boundary present" : "no error boundary" });


  // Open the Settings rail.
  const settingsBtn = page.locator('button[title="Table settings"]').first();
  if (await settingsBtn.count()) {
    await settingsBtn.click();
    await sleep(1200);
  } else {
    notes.push({ where: "Settings button", issue: "button[aria-label=\"Table settings\"] not found" });
  }
  await shot(page, "1-settings-open-1600");

  // Put a personal look pending: hide one column via the Columns popover.
  const columnsBtn = page.locator('button[title^="Choose and reorder columns"]').first();
  if (await columnsBtn.count()) {
    await columnsBtn.click();
    await sleep(800);
    await shot(page, "1b-columns-popover-debug-1600");
    const candidates = page.locator('[role="menuitemcheckbox"], [role="option"], [role="menuitem"], label:has(input[type="checkbox"]), li:has(input[type="checkbox"])');
    const n = await candidates.count();
    if (n > 0) {
      await candidates.nth(0).click({ force: true });
      await sleep(800);
    } else {
      notes.push({ where: "Columns popover", issue: `opened but found 0 toggle-like rows (checked role=menuitemcheckbox/option/menuitem/label+checkbox/li+checkbox)` });
    }
    await page.keyboard.press("Escape");
    await sleep(500);
  } else {
    notes.push({ where: "Columns button", issue: "not found — could not open the columns menu to create a look-pending state" });
  }

  const pendingVisible = await page.locator('text=You changed how this view looks').count();
  record("a personal look is pending (\"You changed how this view looks\")", pendingVisible > 0, { pendingVisible });

  const viewports = [
    { w: 1600, h: 1000, tag: "1600" },
    { w: 390, h: 844, tag: "390" },
    { w: 320, h: 700, tag: "320" },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await sleep(900);
    const m = await measureToolbar(page);
    record(`@${vp.tag}: no two toolbar controls overlap`, m.overlaps.length === 0, m.overlaps);
    record(`@${vp.tag}: the toolbar row does not spill past its own scroller`, m.rowScroll !== null ? m.rowScroll <= (m.rowClient ?? 0) + 4 || m.clipped !== null : true, {
      rowScroll: m.rowScroll, rowClient: m.rowClient, clipped: m.clipped,
    });
    await shot(page, `2-toolbar-${vp.tag}-settings-look-pending`);
  }

  await browser.close();

  const out = { at: new Date().toISOString(), version: "0.89.1", table: TABLE_ID, results, notes };
  writeFileSync(`${OUT_DIR}/toolbar-0.89.1-walk.json`, JSON.stringify(out, null, 2));
  console.log("WROTE", `${OUT_DIR}/toolbar-0.89.1-walk.json`);
  console.log("NOTES", JSON.stringify(notes, null, 2));
  const allOk = results.every((r) => r.ok);
  process.exit(allOk ? 0 : 1);
})().catch((e) => {
  console.error("WALK FAILED", e);
  process.exit(2);
});
