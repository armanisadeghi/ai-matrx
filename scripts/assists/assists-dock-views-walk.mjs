// scripts/assists/assists-dock-views-walk.mjs — LANE ASSISTS-DOCK-COST (2026-10-01, DH3-VERIFY-2 items)
//
// THE ASSISTS CONTROL ON EVERY DATA HOME VIEW, from a real seat (headless, 1440x900): the table
// (pager), grouped by kind (no pager), the cards view, and the cards view after a reload. For each:
// the control is at full opacity, in a slot or over nothing (no row, no control under any of its
// points), and the page's main area carries no padding the dock wrote. PASS/FAIL lines + shots.
//
//   WALK_ORIGIN=http://<you>.localhost:3001 WALK_SEAT=admin|member WALK_EMAIL=… WALK_PASSWORD=… \
//     WALK_SHOTS=<dir> node scripts/assists/assists-dock-views-walk.mjs
//
// Credentials come from the environment and are never printed. It switches the seat's view to
// Cards and back to Table (a synced preference of the test seat), and writes nothing else.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN;
const SEAT = process.env.WALK_SEAT ?? "admin";
const EMAIL = process.env.WALK_EMAIL;
const PASSWORD = process.env.WALK_PASSWORD;
const SHOTS = process.env.WALK_SHOTS ?? "tmp/assists-dock-views";
if (!ORIGIN || !EMAIL || !PASSWORD) throw new Error("WALK_ORIGIN, WALK_EMAIL and WALK_PASSWORD must be set");
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const pass = (clause, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} [${SEAT}] ${clause}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const where = () =>
  page.evaluate(() => {
    const INTERACTIVE =
      'button, a[href], input, select, textarea, label, summary, [role="switch"], [role="checkbox"], [role="radio"], [role="button"], [role="tab"], [role="menuitem"], [role="link"]';
    const ROW = '[data-row-id], [data-matrx-table-group-row], tr, [role="row"]';
    const el = [...document.querySelectorAll("[data-assists-dock]")].find((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const main = document.querySelector("main");
    const mainPad = main ? { inline: main.style.paddingBottom, cleared: main.hasAttribute("data-assist-clearance") } : null;
    if (!el) return { dock: null, mainPad };
    const r = el.getBoundingClientRect();
    const under = [];
    for (const x of [r.left + 2, (r.left + r.right) / 2, r.right - 2]) {
      for (const y of [r.top + 2, (r.top + r.bottom) / 2, r.bottom - 2]) {
        const hit = document.elementsFromPoint(x, y).find((e) => !e.closest("[data-assists-dock]"));
        const bad = hit?.closest(ROW) ?? hit?.closest(INTERACTIVE);
        if (bad) under.push(`${bad.tagName.toLowerCase()}${bad.getAttribute("data-row-id") ? `#${bad.getAttribute("data-row-id")}` : ""}`);
      }
    }
    const cards = document.querySelector("[data-matrx-table-cards-scroll]") ?? document.querySelector("main [data-row-id]")?.parentElement;
    return {
      dock: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
      slot: document.documentElement.getAttribute("data-assist-dock-slot") ?? "floating",
      opacity: getComputedStyle(el).opacity,
      yielding: el.hasAttribute("data-assist-dock-yield"),
      under: [...new Set(under)],
      mainPad,
      listBox: cards ? Math.round(cards.getBoundingClientRect().height) : null,
    };
  });

async function check(name) {
  await sleep(1500);
  const m = await where();
  await page.screenshot({ path: `${SHOTS}/${SEAT}-1440-${name}.png` });
  if (!m.dock) {
    pass(`${name}: the control is shown`, false, "no visible dock (this seat has no assists to show)");
    return m;
  }
  pass(`${name}: full opacity, takes clicks`, m.opacity === "1" && !m.yielding, `opacity ${m.opacity}, slot ${m.slot}`);
  pass(`${name}: no row and no control under it`, m.under.length === 0, m.under.length ? `under: ${m.under.join(", ")}` : `at ${m.dock.top}-${m.dock.bottom}, ${m.slot}`);
  pass(`${name}: the page's main area carries no dock padding`, m.mainPad && m.mainPad.inline === "" && !m.mainPad.cleared, JSON.stringify(m.mainPad));
  return m;
}

const ready = async () => {
  await until("rows", async () => (await page.locator("main [data-row-id]:visible").count()) > 0, 180000);
  await page.waitForSelector("[data-assists-dock]", { state: "attached", timeout: 60000 }).catch(() => {});
};

try {
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
  pass("signed in as the intended seat", who === EMAIL, who === EMAIL ? "identity matches" : "a different identity answered");

  await page.goto(`${ORIGIN}/data`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await ready();
  await check("table");

  await page.goto(`${ORIGIN}/data?group=kind`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await ready();
  const grouped = await check("grouped-kind");
  pass("grouped-kind: in a slot (no pager on this view)", grouped.slot === "header" || grouped.slot === "footer", grouped.slot);
  // Scrolled to the middle of the groups, the answer holds once the scroll comes to rest.
  await page.evaluate(() => {
    const row = document.querySelector("main [data-row-id]");
    let el = row;
    while (el && !(el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    if (el) el.scrollTop = el.scrollHeight / 2;
  });
  await check("grouped-kind-scrolled");

  await page.goto(`${ORIGIN}/data`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await ready();
  await page.getByRole("button", { name: "Cards" }).first().click();
  await sleep(1500);
  const cards = await check("cards");
  for (let i = 0; i < 3; i++) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 240000 });
    await ready();
    const after = await check(`cards-reload-${i}`);
    pass(`cards-reload-${i}: the cards fill the page (not squeezed)`, (after.listBox ?? 0) >= 600, `list box ${after.listBox}px (first load ${cards.listBox}px)`);
  }
  // Put the seat's view back.
  await page.getByRole("button", { name: "Table" }).first().click().catch(() => {});
  await sleep(1500);
} finally {
  await browser.close();
}
console.log(failed === 0 ? `ALL PASS (${SEAT})` : `${failed} FAILED (${SEAT})`);
process.exit(failed === 0 ? 0 : 1);
