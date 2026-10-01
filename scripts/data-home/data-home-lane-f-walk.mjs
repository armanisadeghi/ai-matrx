// scripts/data-home/data-home-lane-f-walk.mjs — LANE DATA-HOME-3F
//
// Walks the three fix-before-Arman defects of VERIFY-DATA-HOME-3 Verify 2 on `/data-v2?home=new`
// from a real seat (headless) and takes the named screenshots:
//   W3 390   — phone cards: height of each, how many fit the first screen, no "more fields"
//   W5 1440  — Cards view: every Table card's Records is a count once the store answers, and the
//              first card's count equals the table view's Records cell for the same row
//   W4 1440  — archive: first page ≤ 200 rows, "Show more" adds the next page, no Postgres text
//
//   DH_ORIGIN=http://<you>.localhost:3001 DH_SEAT=admin|member DH_EMAIL=… DH_PASSWORD=… \
//     DH_SHOTS=<dir> DH_SCHEME=light|dark node scripts/data-home/data-home-lane-f-walk.mjs
//
// Credentials come from the environment and are never printed. Writes only the seat's own view
// preference (Cards, then back to Table).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.DH_ORIGIN;
const SEAT = process.env.DH_SEAT ?? "admin";
const SHOTS = process.env.DH_SHOTS ?? "tmp/data-home-3f";
const SCHEME = process.env.DH_SCHEME ?? "light";
const ONLY = (process.env.DH_ONLY ?? "390,cards,archive").split(",");
const EMAIL = process.env.DH_EMAIL;
const PASSWORD = process.env.DH_PASSWORD;
if (!ORIGIN || !EMAIL || !PASSWORD) throw new Error("DH_ORIGIN, DH_EMAIL and DH_PASSWORD must be set");
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`[${SEAT} ${SCHEME}] ${pass ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(detail)}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: SCHEME });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});

const whoami = () => page.evaluate(async () => (await (await fetch("/api/whoami")).json())?.email ?? null).catch(() => null);
await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
let who = await whoami();
if (who !== EMAIL) who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
check("identity matches seat", who === EMAIL, { seat: SEAT });

const ROW = "[data-row-id]:visible";
const shot = (name) => page.screenshot({ path: `${SHOTS}/f-${SEAT}-${name}-${SCHEME}.png`, fullPage: false });
const goto = async () => {
  await page.goto(`${ORIGIN}/data-v2?home=new`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("rows", async () => (await page.locator(ROW).count()) > 0, 180000);
  await sleep(2500);
};
// The page scrolls inside the shell, not the window: bring every scroller to its end until the
// archive (mounted when near) is there.
const reachArchive = async () => {
  for (let i = 0; i < 20; i += 1) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("*")) {
        if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    if ((await page.locator("[data-testid=archived-disclosure-toggle]").count()) > 0) break;
    await sleep(750);
  }
  await page.locator("[data-data-home-archive]").first().scrollIntoViewIfNeeded().catch(() => {});
};
const setView = async (label) => {
  const toggle = page.getByRole("button", { name: label, exact: true }).first();
  if (await toggle.count()) await toggle.click();
  await sleep(1500);
};

try {
  if (ONLY.includes("390")) {
    await page.setViewportSize({ width: 390, height: 844 });
    await goto();
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll("[data-entity-phone-card]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), text: el.textContent ?? "" };
      }),
    );
    const onScreen = cards.filter((c) => c.top >= 0 && c.bottom <= 844);
    const heights = cards.slice(0, 10).map((c) => c.h);
    check("phone cards: ≥ 6 whole cards on the first screen", onScreen.length >= 6, { onScreen: onScreen.length, heights });
    check("phone cards: none says 'more fields'", !cards.some((c) => /more field/.test(c.text)), { cards: cards.length });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    check("phone: no sideways scroll", wide <= 390, { scrollWidth: wide });
    await shot("390-home");
    // The whole card is the door: a tap on the second line (not the name) opens the table.
    const line = page.locator("[data-entity-phone-card-line]").first();
    const box = await line.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const opened = await until("opened", async () => /\/data-v2\/[^?]/.test(new URL(page.url()).pathname), 60000)
      .then((r) => Boolean(r.v));
    check("phone: a tap on the card's second line opens the row", opened, { url: new URL(page.url()).pathname });
  }

  if (ONLY.includes("cards")) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goto();
    // The table view's Records for the first Table rows, by row id.
    await sleep(2500);
    const tableCounts = await page.evaluate(() => {
      const out = {};
      for (const tr of [...document.querySelectorAll("[data-row-id]")].slice(0, 30)) {
        const cells = [...tr.querySelectorAll("[role=cell], td")];
        const cell = cells.find((c) => /^\d[\d,]*$/.test((c.textContent ?? "").trim()));
        if (cell) out[tr.getAttribute("data-row-id")] = (cell.textContent ?? "").trim();
      }
      return out;
    });
    await setView("Cards");
    await until("cards", async () => (await page.locator("[data-data-home-cards] [data-row-id]").count()) > 0, 60000);
    await sleep(3000);
    const cardCounts = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("[data-data-home-cards] [data-row-id]")].slice(0, 30).map((a) => [
          a.getAttribute("data-row-id"),
          (a.querySelector("[data-data-home-card-records]")?.textContent ?? "").trim(),
        ]),
      ),
    );
    const compared = Object.entries(tableCounts).filter(([id]) => id in cardCounts);
    const mismatched = compared.filter(([id, n]) => cardCounts[id] !== `${n} records`);
    check("cards: Records equals the table view's count", compared.length > 0 && mismatched.length === 0, {
      compared: compared.length,
      mismatched: mismatched.slice(0, 3),
      sample: compared.slice(0, 3).map(([id, n]) => [n, cardCounts[id]]),
    });
    await shot("1440-cards");
    await setView("Table");
  }

  if (ONLY.includes("archive")) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goto();
    await reachArchive();
    await until("archive mounted", async () => (await page.locator("[data-testid=archived-disclosure-toggle]").count()) > 0, 60000);
    const t0 = Date.now();
    await page.locator("[data-testid=archived-disclosure-toggle]").first().click();
    await until(
      "archive answered",
      async () => (await page.locator("[data-archived-table], [data-archive-read-trouble]").count()) > 0,
      60000,
    ).catch(() => {});
    const firstMs = Date.now() - t0;
    const first = await page.locator("[data-archived-table]").count();
    const text = (await page.locator("[data-data-home-archive]").textContent()) ?? "";
    const more = await page.locator("[data-archived-tables-more]").textContent().catch(() => null);
    check("archive: first page ≤ 200 rows", first > 0 && first <= 200, { first, firstMs, more });
    check("archive: no Postgres words", !/canceling statement|statement timeout|57014/i.test(text), {});
    await page.locator("[data-data-home-archive]").scrollIntoViewIfNeeded();
    await shot("1440-archive-open");
    if (more) {
      await page.getByRole("button", { name: "Show more", exact: true }).click();
      await until("next page", async () => (await page.locator("[data-archived-table]").count()) > first, 60000).catch(() => {});
      const second = await page.locator("[data-archived-table]").count();
      check("archive: Show more adds the next page", second > first && second <= first + 200, { first, second });
      await shot("1440-archive-more");
    }
    // A second open (the one that timed out in Verify 2).
    await goto();
    await reachArchive();
    await until("archive mounted", async () => (await page.locator("[data-testid=archived-disclosure-toggle]").count()) > 0, 60000);
    await page.locator("[data-testid=archived-disclosure-toggle]").first().click();
    await until("archive answered", async () => (await page.locator("[data-archived-table], [data-archive-read-trouble]").count()) > 0, 60000).catch(() => {});
    const again = await page.locator("[data-archived-table]").count();
    const text2 = (await page.locator("[data-data-home-archive]").textContent()) ?? "";
    check("archive: second open answers, no Postgres words", again > 0 && !/canceling statement|statement timeout/i.test(text2), { again });
  }
} catch (error) {
  check("walk ran to the end", false, String(error).slice(0, 300));
} finally {
  check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3));
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`[${SEAT} ${SCHEME}] ${results.length - failed}/${results.length} pass`);
  process.exitCode = failed ? 1 : 0;
}
