/**
 * The VISUAL half of the baseline.
 *
 * `compare.mjs` records what the grid ANSWERS; these are what it LOOKS like,
 * on the same fixture, so the next lane can put the two side by side rather
 * than reading a description of one of them. Every shot is of the grid `/data`
 * renders TODAY — the hand-rolled one — because that is what is on screen. A
 * shot captioned "on the shared table" would be the one lie this whole method
 * exists to prevent.
 *
 *   node scripts/grid-parity/shots.mjs --out <dir>
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HERE = resolve(ROOT, "scripts/grid-parity");
const PORTS = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-ports.json"), "utf8"));
const PORT = PORTS.lanes["GRID-THREE"];
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:${PORT}`;
const fixture = JSON.parse(readFileSync(resolve(HERE, ".fixture.json"), "utf8"));
const BASE = `/data/${fixture.tableId}?sort=job.asc&ps=100`;

const argv = process.argv.slice(2);
const OUT = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : resolve(HERE, "shots");
mkdirSync(OUT, { recursive: true });

const PREFIX = "grid-parity-before";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(BASE)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (!who?.email) throw new Error("no identity");
  console.log(`[shots] signed in as ${who.email}`);

  /**
   * A SKELETON SATISFIES `table tbody tr`. The first run of this script shot
   * five pictures of the loading placeholder and they looked like a working
   * screen — the same trap `compare.mjs` already guards. A shot is only taken
   * once the real rows are on screen.
   */
  const settle = async (url, attempts = 6) => {
    let last = null;
    for (let i = 0; i < attempts; i += 1) {
      await page.goto(`${ORIGIN}${url}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector("table tbody tr", { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const state = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll("table"))
          .sort((a, b) => b.querySelectorAll("tbody tr").length - a.querySelectorAll("tbody tr").length)[0];
        if (!t) return { rows: 0, job001: null };
        const rows = Array.from(t.querySelectorAll("tbody tr"));
        return {
          rows: rows.length,
          job001: rows.some((tr) => (tr.children[1]?.textContent || "").trim() === "Job 001"),
        };
      });
      last = state;
      if (state.rows >= 100 && state.job001) return;
      console.log(`[shots] not settled (rows=${state.rows}) — retry ${i + 1}/${attempts}`);
      await page.waitForTimeout(5000);
    }
    throw new Error(`the fixture grid never rendered: ${JSON.stringify(last)}`);
  };

  await settle(BASE);
  const shot = async (name) => {
    const file = resolve(OUT, `${PREFIX}-${name}.png`);
    await page.screenshot({ path: file });
    console.log(`[shots] ${file}`);
  };

  // 1. The colours: colour-by on Status, the Owner column highlight, the
  //    manual cell highlight on Job 001.
  await shot("colours");

  // 2. The rule: Amount > 3000 tints the cell amber. Scroll it into view.
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll("table"))
      .sort((a, b) => b.querySelectorAll("tbody tr").length - a.querySelectorAll("tbody tr").length)[0];
    const rows = Array.from(t.querySelectorAll("tbody tr"));
    const row = rows.find((tr) => (tr.children[1]?.textContent || "").trim() === "Job 078");
    row?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(800);
  await shot("colour-rule-over-3000");

  // 3. The formula column, right-hand end of the table.
  await settle(BASE);
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll("table"))
      .sort((a, b) => b.querySelectorAll("tbody tr").length - a.querySelectorAll("tbody tr").length)[0];
    const ths = Array.from(t.querySelectorAll("thead th"));
    ths[ths.length - 1]?.scrollIntoView({ block: "start", inline: "end" });
  });
  await page.waitForTimeout(800);
  await shot("formula-column");

  // 4. The right-click menu on a cell.
  await settle(BASE);
  const box = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll("table"))
      .sort((a, b) => b.querySelectorAll("tbody tr").length - a.querySelectorAll("tbody tr").length)[0];
    const rows = Array.from(t.querySelectorAll("tbody tr"));
    const row = rows.find((tr) => (tr.children[1]?.textContent || "").trim() === "Job 004");
    const cell = row?.children[4];
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (box) {
    await page.mouse.click(box.x, box.y, { button: "right" });
    await page.waitForTimeout(1200);
    await shot("context-menu");
    await page.keyboard.press("Escape");
  }

  // 5. The column's filter panel with its real value counts.
  await settle(BASE);
  const trigger = page
    .locator('table thead th [title*="Sort or filter Status" i], table thead th [aria-label*="Sort or filter Status" i]')
    .first();
  await trigger.scrollIntoViewIfNeeded({ timeout: 20000 });
  await trigger.click({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot("filter-value-counts");

  await browser.close();
}

main().catch((err) => {
  console.error(`[shots] FAILED: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
