/**
 * check:list-header-rows — THE LIST HEADER IS TWO ROWS, EACH ONE LINE (owner, 2026-10-04).
 *
 * Row 1 is lanes · filters · page actions; row 2 is view tabs · search · tools. Never a third line,
 * never a control clipped by the header's edge, never two controls overlapping — at any PANE width.
 * The pane is what decides, never the viewport: beside the chat panel a 1024px screen holds a 540px
 * list, and that is where the header used to take four lines (/agents/all). jsdom has no layout,
 * so this measures real pages in a real browser, signed in, with the chat panel open and closed.
 *
 * Usage (against the shared preview; `pnpm dev-login /agents/all` prints the single-use URL):
 *   pnpm check:list-header-rows --login-url <dev-login url> [--route /agents/all ...] [--out <dir>]
 * Exit 1 names every (route, width, chat) that broke the rule; --out also writes screenshots.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const [login] = opt("--login-url");
const routes = opt("--route").length ? opt("--route") : ["/agents/all", "/board/all", "/research/topics"];
const [out] = opt("--out");
if (!login) {
  console.error("check:list-header-rows needs --login-url (pnpm dev-login /agents/all prints one)");
  process.exit(2);
}
if (out) mkdirSync(out, { recursive: true });
const WIDTHS = [
  [1920, 1000],
  [1440, 900],
  [1024, 800],
  [768, 900],
  [375, 812],
];

/** Lines per row (distinct vertical centres), overlaps between controls, controls past the header. */
const measure = (page) =>
  page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const header = q("[data-entity-list-header]");
    const row = q("[data-entity-list-control-row]");
    const toolbar = q("[data-entity-list-toolbar]") ?? q("[data-entity-list-phone-controls]");
    const shown = (e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.position !== "absolute";
    };
    const rowKids = [...(row?.children ?? [])].filter(shown);
    const toolKids = toolbar && !row?.contains(toolbar) ? [...toolbar.children].filter(shown) : [];
    const lines = (els) => {
      const mids = [];
      for (const e of els) {
        const r = e.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (!mids.some((m) => Math.abs(m - mid) < 8)) mids.push(mid);
      }
      return mids.length;
    };
    const hr = header?.getBoundingClientRect();
    const kids = [...rowKids, ...toolKids];
    let overlaps = 0;
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i].getBoundingClientRect();
      for (let j = i + 1; j < kids.length; j++) {
        const b = kids[j].getBoundingClientRect();
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
      }
    }
    const controls = [...(header?.querySelectorAll("button, a, input, [role=combobox], [role=tab]") ?? [])].filter(shown);
    const clipped = controls
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return hr && (r.right > hr.right + 1 || r.left < hr.left - 1);
      })
      .map((e) => e.getAttribute("aria-label") || e.textContent?.trim().slice(0, 30));
    return {
      paneWidth: hr ? Math.round(hr.width) : null,
      chatOpen: (row?.getBoundingClientRect().left ?? 0) > 120,
      row1Lines: lines(rowKids),
      toolbarLines: lines(toolKids),
      toolbarBelow: Boolean(row && toolbar && toolbar.getBoundingClientRect().top >= row.getBoundingClientRect().bottom - 1),
      overlaps,
      clipped,
    };
  });

const browser = await chromium.launch();
const host = new URL(login).origin;
const signIn = await browser.newContext();
await (await signIn.newPage()).goto(login, { waitUntil: "domcontentloaded", timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const storageState = await signIn.storageState();
await signIn.close();

const failures = [];
const results = [];
for (const route of routes) {
  for (const [width, height] of WIDTHS) {
    for (const wantChat of [true, false]) {
      const context = await browser.newContext({
        storageState,
        viewport: { width, height },
        ...(width < 768 ? { isMobile: true, hasTouch: true } : {}),
      });
      const page = await context.newPage();
      await page.goto(host + route, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector("[data-entity-list-control-row]", { timeout: 90000 }).catch(() => {});
      await page.waitForSelector("[data-row-id]", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      let m = await measure(page);
      if (m.chatOpen !== wantChat) {
        const chat = page.locator('button[aria-label="Chat"]').first();
        if (await chat.count()) {
          await chat.click().catch(() => {});
          await page.waitForTimeout(2500);
          m = await measure(page);
        }
      }
      const at = `${route} @${width}${m.chatOpen ? " +chat" : ""} (pane ${m.paneWidth}px)`;
      if (out) await page.screenshot({ path: `${out}/${route.replace(/\W+/g, "_").replace(/^_|_$/g, "")}-${width}-${m.chatOpen ? "chat" : "nochat"}.png` });
      const broke = [];
      if (m.row1Lines !== 1) broke.push(`row 1 is ${m.row1Lines} lines`);
      if (m.toolbarLines !== 1) broke.push(`the toolbar is ${m.toolbarLines} lines`);
      if (!m.toolbarBelow) broke.push("the toolbar is not under row 1");
      if (m.overlaps) broke.push(`${m.overlaps} overlapping controls`);
      if (m.clipped.length) broke.push(`clipped: ${m.clipped.join(", ")}`);
      results.push({ at, ...m });
      if (broke.length) failures.push(`${at}: ${broke.join("; ")}`);
      await context.close();
    }
  }
}
await browser.close();
for (const r of results) console.log(`${r.at}: row1 ${r.row1Lines} · toolbar ${r.toolbarLines} · overlaps ${r.overlaps} · clipped ${r.clipped.length}`);
if (failures.length) {
  console.error(`\nTHE LIST HEADER BROKE ITS TWO ROWS in ${failures.length} place(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nTwo rows, one line each, nothing clipped or overlapping: ${results.length} views.`);
