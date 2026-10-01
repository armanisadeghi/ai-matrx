// scripts/data-home/data-home-keys-walk.mjs — LANE DATA-HOME-3C
//
// THE DATA HOME'S KEYS, ⌘K TABLES AND RECENT, WALKED FROM A REAL SEAT (headless) at 1440 and 390.
// Real key presses through Playwright's keyboard: `/` focuses the box, typing `s` there stars
// nothing, ↓ moves into the rows, `s` stars the focused row (and again removes it), Enter opens it,
// Back shows it under Recent, Esc clears the box; from another page ⌘K lists a table under Tables
// with its organization and selecting it opens the table. Also measures the floating assists
// control against the row it rests on. PASS/FAIL lines + named screenshots.
//
//   DH_ORIGIN=http://<you>.localhost:3001 DH_SEAT=admin|member DH_EMAIL=… DH_PASSWORD=… \
//     DH_SHOTS=<dir> node scripts/data-home/data-home-keys-walk.mjs
//
// Credentials come from the environment and are never printed. The star it sets is removed again.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.DH_ORIGIN;
const SEAT = process.env.DH_SEAT ?? "admin";
const SHOTS = process.env.DH_SHOTS ?? "tmp/data-home-3c";
const EMAIL = process.env.DH_EMAIL;
const PASSWORD = process.env.DH_PASSWORD;
if (!ORIGIN || !EMAIL || !PASSWORD) throw new Error("DH_ORIGIN, DH_EMAIL and DH_PASSWORD must be set");
mkdirSync(SHOTS, { recursive: true });

const results = [];
const pass = (clause, ok, detail = "") => {
  results.push({ seat: SEAT, clause, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${SEAT}] ${clause}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOD = process.platform === "darwin" ? "Meta" : "Control";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
});

async function unpark() {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
  if (page.url().includes("__dev-walk")) {
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(6000);
  }
}
await unpark();
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame() && frame.url().includes("__dev-walk")) {
    void page.getByRole("button", { name: /Resume/ }).first().click({ timeout: 10000 }).catch(() => {});
  }
});
const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
pass("signed in as the intended seat", who === EMAIL, who === EMAIL ? "identity matches" : "a different identity answered");

const shot = (name) => page.screenshot({ path: `${SHOTS}/${SEAT}-${name}.png`, fullPage: false });
const ROW = "[data-row-id]:visible";
const waitRows = async () => (await until("rows", async () => (await page.locator(ROW).count()) > 0, 120000)).v;
const goto = async (query = "") => {
  await page.goto(`${ORIGIN}/data-v2?home=new${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitRows();
  await sleep(1200);
};
const active = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      search: Boolean(a?.hasAttribute?.("data-entity-list-search")),
      row: a?.closest?.("[data-row-id]")?.getAttribute("data-row-id") ?? null,
      tag: a?.tagName ?? null,
    };
  });
const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

try {
  // ── 1440: keys ────────────────────────────────────────────────────────────────────────────
  await goto();
  await page.locator("body").click({ position: { x: 700, y: 5 } }).catch(() => {});
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press("/");
  let a = await active();
  pass("`/` focuses the search box", a.search, JSON.stringify(a));
  await shot("after-keyboard-focus");

  const firstName = (await page.locator(ROW).first().innerText()).split("\n").find((l) => l.trim().length > 2)?.trim() ?? "";
  const word = firstName.split(/\s+/)[0] ?? "";
  await page.keyboard.type(word.toLowerCase().slice(0, 4) + "s", { delay: 40 });
  await sleep(600);
  a = await active();
  pass("typing `s` in the box stays typing", a.search && (await page.locator("[data-entity-list-search]").inputValue()).endsWith("s"));
  await page.keyboard.press("Escape");
  await sleep(500);
  pass("Esc clears the box", (await page.locator("[data-entity-list-search]").inputValue()) === "");

  await page.keyboard.press("ArrowDown");
  await sleep(300);
  a = await active();
  const firstId = await page.locator(ROW).first().getAttribute("data-row-id");
  pass("↓ from the box focuses the first row", a.row === firstId, `${a.row}`);
  await page.keyboard.press("ArrowDown");
  await sleep(300);
  const second = await active();
  pass("↓ moves to the next row", second.row && second.row !== firstId, `${second.row}`);
  await page.keyboard.press("ArrowUp");
  await sleep(200);
  pass("↑ moves back", (await active()).row === firstId);
  await page.keyboard.press("ArrowDown");
  await sleep(200);
  await shot("after-keyboard-row");

  const target = (await active()).row;
  const starLabel = () =>
    page.evaluate((id) => {
      const row = document.querySelector(`tr[data-row-id="${CSS.escape(id)}"]`);
      return row?.querySelector("button[aria-label*='favorites']")?.getAttribute("aria-label") ?? null;
    }, target);
  const before = await starLabel();
  await page.keyboard.press("s");
  await until("star", async () => (await starLabel()) !== before, 15000).catch(() => {});
  const after = await starLabel();
  pass("`s` stars the focused row (the shell's words)", before === "Add to favorites" && after === "Remove from favorites", `${before} → ${after}`);
  // The row moved to the top (favorites first); focus it again and remove the star.
  await page.evaluate((id) => {
    const el = document.querySelector(`tr[data-row-id="${CSS.escape(id)}"]`);
    if (el instanceof HTMLElement) {
      el.tabIndex = -1;
      el.focus();
    }
  }, target);
  await page.keyboard.press("s");
  await until("unstar", async () => (await starLabel()) === "Add to favorites", 15000).catch(() => {});
  pass("`s` again removes it", (await starLabel()) === "Add to favorites");

  // Enter opens the focused row; Back shows it under Recent.
  await page.evaluate((id) => {
    const el = document.querySelector(`tr[data-row-id="${CSS.escape(id)}"]`);
    if (el instanceof HTMLElement) {
      el.tabIndex = -1;
      el.focus();
    }
  }, target);
  const homeUrl = page.url();
  await page.keyboard.press("Enter");
  const moved = await until("opened", async () => page.url() !== homeUrl, 60000).then(() => true, () => false);
  pass("Enter opens the focused row", moved, page.url().replace(ORIGIN, ""));
  await goto();
  const recent = page.locator("[data-data-home-recent]");
  const recentHas = await until(
    "recent",
    async () => (await page.locator(`[data-data-home-recent-item="${target}"]`).count()) > 0,
    20000,
  ).then(() => true, () => false);
  pass("Recent shows the opened row on an empty search", recentHas);
  await shot("after-recent");
  await page.locator("[data-entity-list-search]").fill("zz");
  await sleep(500);
  pass("Recent hides while a search is typed", (await recent.count()) === 0);
  await page.locator("[data-entity-list-search]").fill("");
  await sleep(500);

  // ── the assists control against the rows ─────────────────────────────────────────────────
  const dock = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-assists-dock]")].find((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const covered = [...document.querySelectorAll("tr[data-row-id]")].find((tr) => {
      const t = tr.getBoundingClientRect();
      return t.top < r.bottom && t.bottom > r.top;
    });
    return {
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      yielding: el.hasAttribute("data-assist-dock-yield") || Boolean(el.querySelector("[data-assist-dock-yield]")),
      opacity: getComputedStyle(el.querySelector("[data-assist-dock-yield]") ?? el).opacity,
      lift: document.documentElement.style.getPropertyValue("--assist-dock-lift") || "0",
      dockH: document.documentElement.style.getPropertyValue("--page-bottom-dock-h") || "0",
      overRow: covered?.getAttribute("data-row-id") ?? null,
    };
  });
  pass("assists control measured", true, JSON.stringify(dock));
  await shot("after-assists-1440");

  // ── ⌘K Tables from another page ──────────────────────────────────────────────────────────
  const titleOf = (await page.locator(ROW).nth(2).innerText()).split("\n").find((l) => l.trim().length > 2)?.trim() ?? "";
  await page.goto(`${ORIGIN}/notes`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(4000);
  await page.keyboard.press(`${MOD}+k`);
  const opened = await until("bar", async () => (await page.locator('[data-testid="knowledge-command-input"]').count()) > 0, 30000).then(
    () => true,
    () => false,
  );
  pass("⌘K opens the bar on another page", opened);
  await page.locator('[data-testid="knowledge-command-input"]').fill(titleOf);
  const tables = page.locator('[data-testid="command-bar-tables"]');
  const listed = await until(
    "tables hit",
    async () =>
      (await tables.count()) > 0 &&
      (await page.locator("[cmdk-group]").filter({ has: tables }).locator("[cmdk-item]").filter({ hasText: titleOf }).count()) > 0,
    60000,
  ).then(() => true, () => false);
  const hit = page.locator("[cmdk-group]").filter({ has: tables }).locator("[cmdk-item]").filter({ hasText: titleOf }).first();
  const hitText = listed ? await hit.innerText() : "";
  pass("⌘K lists the table under Tables with its organization", listed && hitText.includes("·"), `"${titleOf}" → ${hitText.replace(/\n/g, " | ")}`);
  await shot("after-cmdk-tables");
  if (listed) {
    // Arrow onto the hit, then Enter (the bar's own keyboard).
    const value = await hit.getAttribute("data-value");
    for (let i = 0; i < 25; i += 1) {
      const sel = await page.locator("[cmdk-item][data-selected='true']").getAttribute("data-value").catch(() => null);
      if (sel === value) break;
      await page.keyboard.press("ArrowDown");
    }
    const before = page.url();
    await page.keyboard.press("Enter");
    const went = await until("cmdk open", async () => page.url() !== before && page.url().includes("/data-v2/"), 60000).then(
      () => true,
      () => false,
    );
    pass("Enter on the Tables hit opens the table", went, page.url().replace(ORIGIN, ""));
  }

  // ── 390 ──────────────────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await goto();
  pass("390: no sideways scroll", (await noSideways()) <= 0, `${await noSideways()}px`);
  const recentBox = await page.locator("[data-data-home-recent]").boundingBox().catch(() => null);
  pass("390: Recent is one line inside the width", !recentBox || (recentBox.width <= 390 && recentBox.height <= 48), JSON.stringify(recentBox));
  await shot("after-recent-390");
  await page.keyboard.press("/");
  pass("390: `/` focuses the box", (await active()).search);
  await shot("after-keyboard-focus-390");
  await page.locator("[data-entity-list-search]").blur();
  await page.keyboard.press(`${MOD}+k`);
  await until("bar 390", async () => (await page.locator('[data-testid="knowledge-command-input"]').count()) > 0, 30000).catch(() => {});
  await page.locator('[data-testid="knowledge-command-input"]').fill(titleOf);
  await until("tables 390", async () => (await page.locator('[data-testid="command-bar-tables"]').count()) > 0, 60000).catch(() => {});
  await sleep(800);
  pass("390: ⌘K Tables section shows", (await page.locator('[data-testid="command-bar-tables"]').count()) > 0);
  await shot("after-cmdk-tables-390");
} catch (e) {
  pass("walk ran to the end", false, String(e).slice(0, 300));
  await shot("failure").catch(() => {});
} finally {
  writeFileSync(`${SHOTS}/${SEAT}-results.json`, JSON.stringify({ results, consoleErrors: consoleErrors.slice(0, 20) }, null, 2));
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed (${SEAT})`);
process.exit(failed ? 1 : 0);
