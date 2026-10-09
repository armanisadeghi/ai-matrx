// Board Add timing: click Add -> row, measure click -> tile visible and click -> body interactive.
//   MATRX_PREVIEW_SESSION=am35 node scripts/board-add-timing.mjs [--shots <dir>] [--runs 3]
// Signs in as the dev-login admin (a single-use nonce), opens a NEW board, adds Note, Table and
// Chat through the real Add menu, and prints a markdown table. The board it makes is deleted.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const shots = flag("--shots", null);
const runs = Number(flag("--runs", "3"));
const session = process.env.MATRX_PREVIEW_SESSION || "am35";

const out = execSync(`MATRX_PREVIEW_SESSION=${session} bash scripts/dev-login.sh /board`, { encoding: "utf8" });
const open = out.match(/OPEN\s*:\s*(\S+)/)[1];
const origin = new URL(open).origin;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(open, { waitUntil: "domcontentloaded" });
await page.waitForURL(/\/board/, { timeout: 120000 });
await page.waitForTimeout(3000);

// New board
async function newBoard() {
  // The walk cap parks a tab at /__dev-walk: Resume brings it back.
  if (!/\/board\/?$/.test(page.url())) await page.goto(`${origin}/board`, { waitUntil: "domcontentloaded" });
  const parked = page.getByRole("button", { name: /resume/i });
  if (await parked.count()) await parked.first().click().catch(() => {});
  await page.getByRole("button", { name: /new board/i }).first().click({ timeout: 180000 });
  await page.waitForURL(/\/board\/[0-9a-f-]{36}/, { timeout: 180000 });
  await page.locator('[role=toolbar][aria-label="Board tools"] button').first().waitFor({ timeout: 120000 });
}
const existing = flag("--board", null);
if (existing) await page.goto(`${origin}/board/${existing}`, { waitUntil: "domcontentloaded" });
else await newBoard();
await page.locator('[role=toolbar][aria-label="Board tools"] button').first().waitFor({ timeout: 120000 });
await page.waitForTimeout(4000);
const boardUrl = page.url();
console.error("board:", boardUrl);

// In-page probe: a MutationObserver stamps when a [data-board-tile] appears and when its body is real.
await page.evaluate(() => {
  window.__t = { clicked: 0, tile: 0, body: 0, bodySel: "" };
  window.__mark = (sel) => {
    // The clock starts at the click EVENT in the page (Playwright's own pre-click checks are not the app's).
    window.__t = { clicked: 0, tile: 0, body: 0, bodySel: sel };
    document.addEventListener("click", () => (window.__t.clicked = performance.now()), { capture: true, once: true });
    const known = new Set([...document.querySelectorAll("[data-board-tile]")].map((e) => e.getAttribute("data-board-tile")));
    const obs = new MutationObserver(() => {
      const fresh = [...document.querySelectorAll("[data-board-tile]")].filter((e) => !known.has(e.getAttribute("data-board-tile")));
      if (!fresh.length) return;
      const tile = fresh[0];
      if (!window.__t.tile) window.__t.tile = performance.now();
      if (!window.__t.body && tile.querySelector("[data-board-body]")?.querySelector(window.__t.bodySel) && !tile.querySelector("[data-tile-skeleton]") && !tile.querySelector('[aria-busy="true"]')) {
        window.__t.body = performance.now();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  };
});

const CASES = [
  { name: "Note", row: /^Note$/, body: ".ProseMirror, [contenteditable=true], textarea" },
  { name: "Table", row: /^New table$/, body: "input, textarea, button" },
  { name: "Chat", row: /^Chat$/, body: "textarea, [contenteditable=true]" },
];
const results = {};
for (const c of CASES) {
  results[c.name] = [];
  for (let i = 0; i < runs; i++) {
    const item = page.locator("[cmdk-item],[role=menuitem]").filter({ hasText: c.row }).first();
    // A click before hydration does nothing; a click on an open menu closes it. So: click, wait, and
    // click again only when the menu is still not there after a generous wait.
    for (let k = 0; k < 3 && !(await item.isVisible()); k++) {
      await page.locator('[role=toolbar][aria-label="Board tools"] button').first().click();
      await item.waitFor({ timeout: 15000 }).catch(() => {});
    }
    await item.waitFor({ timeout: 10000 }).catch(async (e) => {
      await page.screenshot({ path: (shots || ".") + "/fail.png" });
      console.error("menu items:", await page.locator("[cmdk-item]").allInnerTexts(), "case", c.name, i);
      throw e;
    });
    await page.evaluate((sel) => window.__mark(sel), c.body);
    await item.click();
    await page.waitForFunction(() => window.__t.body > 0, null, { timeout: 60000 }).catch(() => {});
    const t = await page.evaluate(() => window.__t);
    results[c.name].push({ tile: t.tile ? Math.round(t.tile - t.clicked) : null, body: t.body ? Math.round(t.body - t.clicked) : null });
    // Let the new tile settle (its editor may take focus), then click empty canvas so the next
    // Add opens on a quiet board.
    await page.waitForTimeout(3000);
    await page.keyboard.press("Escape");
    await page.mouse.click(1380, 140);
    await page.waitForTimeout(800);
  }
}
if (shots) {
  await page.locator('[role=toolbar][aria-label="Board tools"] button').first().click();
  await page.waitForTimeout(400);
}
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : "n/a"; };
console.log("| Type | click -> tile visible (ms) | click -> interactive (ms) | runs |");
console.log("|---|---|---|---|");
for (const [k, v] of Object.entries(results))
  console.log(`| ${k} | ${med(v.map((x) => x.tile))} | ${med(v.map((x) => x.body))} | ${v.map((x) => `${x.tile}/${x.body}`).join(", ")} |`);
console.error("BOARD_URL", boardUrl);
await browser.close();
