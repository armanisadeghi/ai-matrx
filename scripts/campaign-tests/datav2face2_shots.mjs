/**
 * LANE DATA-V2-FACE-2 — headless after-screenshots of /data-v2/<table> from both seats at 1440 and
 * 390: a table whose default view is designated the Sheet, and a table nobody designated.
 *
 *   FACE_ORIGIN=http://data-v2-face-2.localhost:3001 FACE_EMAIL_ADMIN=… FACE_EMAIL_TEST=… FACE_PASSWORD=… \
 *   node scripts/campaign-tests/datav2face2_shots.mjs
 *
 * Read-only: it signs in through the real login form (scripts/lib/seat-browser.mjs), opens pages and
 * takes pictures. Credentials come from the environment and are never printed. Beside each PNG it
 * writes what the header says and the header row's geometry (does the whole name fit; is the
 * organization on the same row), into census-face2.json.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.FACE_ORIGIN ?? "http://data-v2-face-2.localhost:3001";
const OUT =
  process.env.FACE_SHOTS ??
  "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/shots/data-v2-face-2";
const PASSWORD = process.env.FACE_PASSWORD ?? "";
const seats = { admin: process.env.FACE_EMAIL_ADMIN ?? "", test: process.env.FACE_EMAIL_TEST ?? "" };
if (!PASSWORD || !seats.admin || !seats.test) {
  console.error("The seats' sign-in is not in the environment (never printed).");
  process.exit(2);
}
/** designated: admin's Rincon Plumbing — Service Calls (default view designated the Sheet). */
const DESIGNATED = process.env.FACE_DESIGNATED ?? "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
/** Not designated, per seat: admin's Rincon Plumbing — Customers; test's own Rincon-style Jobs. */
const PLAIN = {
  admin: process.env.FACE_PLAIN_ADMIN ?? "415c3e23-2f90-4c66-9040-b246fa1c4b36",
  test: process.env.FACE_PLAIN_TEST ?? "aa29dca8-65bd-4c7d-90b9-f7b25f0145f6",
};
mkdirSync(OUT, { recursive: true });

async function headerFacts(page) {
  return page.evaluate(() => {
    const title = document.querySelector(".hdr-structured-title");
    const ctx = document.querySelector(".hdr-structured-context");
    const t = title?.getBoundingClientRect();
    const c = ctx?.getBoundingClientRect();
    return {
      title: title?.textContent ?? null,
      titleTruncated: title ? title.scrollWidth > title.clientWidth + 1 : null,
      organization: ctx?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      sameRow: t && c ? Math.abs(t.top + t.height / 2 - (c.top + c.height / 2)) < 4 : null,
      contextBelowTitle: t && c ? c.top >= t.bottom - 1 : null,
      standInRow: Boolean(document.querySelector("main [data-table-lives-in]")),
      layoutButtons: Array.from(document.querySelectorAll("main button"))
        .map((b) => (b.textContent ?? "").trim())
        .filter((w) => ["Grid", "Kanban", "Calendar", "Gallery", "Sheet"].includes(w)),
      gridOwnName: Array.from(document.querySelectorAll("main h2")).map((h) => (h.textContent ?? "").trim()),
      viewTabs: Boolean(document.querySelector("main [data-matrx-table-tabs]")),
      sheet: Boolean(document.querySelector("main [data-host-layout='sheet']")),
    };
  });
}

const result = {};
const browser = await chromium.launch({ headless: true });
try {
  for (const [seat, email] of Object.entries(seats)) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await context.newPage();
      const who = await signIn(page, ORIGIN, email, PASSWORD, `${seat} seat`);
      if (who !== email) throw new Error(`${seat}: the app says someone else is signed in`);
      for (const [which, table] of [["designated", DESIGNATED], ["plain", PLAIN[seat]]]) {
        await page.goto(`${ORIGIN}/data-v2/${table}`, { waitUntil: "domcontentloaded", timeout: 240000 });
        await page
          .waitForSelector("table, [data-sheet-layout], [data-host-layout], [role='grid']", { timeout: 120000 })
          .catch(() => {});
        await sleep(7000);
        const shot = `${OUT}/${which}-table-${seat}-${width}.png`;
        await page.screenshot({ path: shot });
        result[`${which}-${seat}-${width}`] = { shot, table, ...(await headerFacts(page)) };
        console.log(`${which} ${seat} ${width}: ${JSON.stringify(result[`${which}-${seat}-${width}`])}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/census-face2.json`, JSON.stringify(result, null, 2));
