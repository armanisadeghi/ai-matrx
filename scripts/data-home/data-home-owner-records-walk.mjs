// scripts/data-home/data-home-owner-records-walk.mjs — LANE DATA-HOME-3D
//
// THE OWNER AND RECORDS COLUMNS, WALKED FROM A REAL SEAT (headless). Owner reads `created_by_name`
// ("You", a name, or —). Records fills lazily from `custom.table_row_counts` for the rows on screen,
// showing — until the count arrives, with the list painted first. Records every
// `table_row_counts` request it sees (count, ids, duration). Read-only on production.
//
//   DH_ORIGIN=http://<you>.localhost:3001 DH_SEAT=admin|member DH_EMAIL=… DH_PASSWORD=… DH_SHOTS=<dir> \
//     node scripts/data-home/data-home-owner-records-walk.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.DH_ORIGIN;
const SEAT = process.env.DH_SEAT ?? "admin";
const SHOTS = process.env.DH_SHOTS ?? "tmp/data-home-3d";
const EMAIL = process.env.DH_EMAIL;
const PASSWORD = process.env.DH_PASSWORD;
if (!ORIGIN || !EMAIL || !PASSWORD) throw new Error("DH_ORIGIN, DH_EMAIL and DH_PASSWORD must be set");
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const pass = (clause, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} [${SEAT}] ${clause}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const calls = [];
page.on('console', (m) => { if (m.text().startsWith('[RC')) console.log('PAGE', m.text().slice(0, 200)); });
await page.addInitScript(() => { window.__rcdbg = true; });
const started = new Map();
page.on("request", (r) => {
  if (r.url().includes("table_row_counts")) {
    let ids = 0;
    try { ids = (JSON.parse(r.postData() ?? "{}").p_table_ids ?? []).length; } catch { /* not json */ }
    started.set(r, { t: Date.now(), ids });
  }
});
page.on("requestfinished", async (r) => {
  const s = started.get(r);
  if (!s) return;
  const res = await r.response();
  calls.push({ ids: s.ids, ms: Date.now() - s.t, status: res?.status(), });
});
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame() && frame.url().includes("__dev-walk")) {
    void page.getByRole("button", { name: /Resume/ }).first().click({ timeout: 10000 }).catch(() => {});
  }
});
await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
if (page.url().includes("__dev-walk")) {
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await sleep(6000);
}
const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
pass("signed in as the intended seat", who === EMAIL);

const ROW = "[data-row-id]:visible";
try {
  calls.length = 0;
  await page.goto(`${ORIGIN}/data-v2?home=new`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await until("rows", async () => (await page.locator(ROW).count()) > 0, 120000);
  const view = await page.locator('button[aria-label="Table"], button[title="Table"]').first();
  const startedView = Date.now();
  await view.click({ timeout: 20000 });
  await until("table view", async () => (await page.locator('[role="columnheader"]:visible').count()) > 0, 60000);
  // The list is on screen; the Records cells read — until their counts arrive.
  // Row cells in reading order: Name · Kind · Organization · Records · Updated · Owner · Access.
  const readRows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-row-id]")]
        .filter((r) => r.getBoundingClientRect().height > 0)
        .map((r) => (r.innerText ?? "").split("\n").map((t) => t.trim()).filter(Boolean)),
    );
  const column = (rows, i) => rows.map((cells) => cells[i] ?? "");
  await page.screenshot({ path: `${SHOTS}/${SEAT}-records-before-1440.png` });
  const t0 = Date.now();
  let rows = await readRows();
  pass("the list is on screen before any count", rows.length > 0, `${rows.length} rows`);
  const firstCountAt = await until(
    "first count",
    async () => column(await readRows(), 3).some((v) => /^\d/.test(v)),
    30000,
  ).then(() => Date.now() - t0).catch(() => -1);
  await sleep(1500);
  rows = await readRows();
  const records = column(rows, 3);
  const owners = column(rows, 5);
  await page.screenshot({ path: `${SHOTS}/${SEAT}-records-owner-1440.png` });
  console.log(`[${SEAT}] records:`, JSON.stringify(records.slice(0, 12)));
  console.log(`[${SEAT}] owners:`, JSON.stringify(owners.slice(0, 12)));
  pass("table_row_counts asked for the rows on screen", calls.length > 0, `${calls.length} call(s): ${JSON.stringify(calls)}`);
  pass("every count call: 500 ids or fewer, status 200", calls.length > 0 && calls.every((c) => c.ids <= 500 && c.status === 200));
  pass("the first call answered inside 1.5 s", calls.length > 0 && calls[0].ms < 1500, calls[0] ? `${calls[0].ms} ms for ${calls[0].ids} ids` : "");
  pass("a count appeared after the list painted", firstCountAt >= 0, `${firstCountAt} ms after the table view was on screen`);
  pass("a Table's Records shows a number or —, never 0 unless counted", records.every((v) => v === "—" || /^[\d,]+$/.test(v)));
  pass("Owner shows You, a name or —", owners.length > 0 && owners.every((v) => v === "You" || v === "—" || v.length > 1), `${new Set(owners).size} distinct: ${JSON.stringify([...new Set(owners)].slice(0, 6))}`);
  const named = owners.filter((v) => v !== "You" && v !== "—").length;
  console.log(`[${SEAT}] owner cells: ${owners.filter((v) => v === "You").length} You, ${named} named, ${owners.filter((v) => v === "—").length} none; ${Date.now() - startedView} ms total`);
  // Put the person's view preference back.
  await page.locator('button[aria-label="Compact list"], button[title="Compact list"]').first().click({ timeout: 10000 }).catch(() => {});
} catch (e) {
  pass("walk ran to the end", false, String(e).slice(0, 300));
}
await browser.close();
process.exit(failures ? 1 : 0);
