/**
 * LANE DATA-V2-FACE — headless screenshots and a census of everything drawn above the records on
 * /data-v2/<table> and /data-v2, from both seats, at 1440 and 390 wide.
 *
 *   FACE_ORIGIN=http://<session>.localhost:3001 FACE_PHASE=before|after \
 *   FACE_EMAIL_ADMIN=… FACE_EMAIL_TEST=… FACE_PASSWORD=… \
 *   node scripts/campaign-tests/datav2face_shots.mjs
 *
 * FACE_TABLE defaults to "Rincon Plumbing — Service Calls" (admin's Workspace), a table copied from
 * the older data system that both seats can open. Credentials come from the environment and are
 * never printed. Headless only, the real login form (scripts/lib/seat-browser.mjs). Writes PNGs and
 * `census-<phase>.json` (the visible words of every control above the records) into FACE_SHOTS.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.FACE_ORIGIN ?? "http://localhost:3001";
const PHASE = process.env.FACE_PHASE ?? "before";
const TABLE = process.env.FACE_TABLE ?? "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const OUT =
  process.env.FACE_SHOTS ??
  "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/shots/data-v2-face";
const PASSWORD = process.env.FACE_PASSWORD ?? "";
const seats = {
  admin: process.env.FACE_EMAIL_ADMIN ?? "",
  test: process.env.FACE_EMAIL_TEST ?? "",
};
if (!PASSWORD || !seats.admin || !seats.test) {
  console.error("The seats' sign-in is not in the environment (never printed).");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

/** Everything drawn between the app header and the first row of records, as words. */
async function census(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const grid = main.querySelector("table, [role='grid'], [data-sheet-layout], [data-host-layout]");
    const gridTop = grid ? grid.getBoundingClientRect().top : Infinity;
    const header = document.querySelector("header");
    const said = [];
    const seen = new Set();
    for (const el of main.querySelectorAll("button, a, p, span, h1, h2, [role='group']")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.top >= gridTop) continue;
      if (el.closest("header") || el.closest("nav") || el.closest("aside")) continue;
      const words = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!words || seen.has(words) || words.length > 220) continue;
      seen.add(words);
      said.push({ tag: el.tagName.toLowerCase(), words, top: Math.round(r.top) });
    }
    const title = header ? header.innerText.replace(/\s+/g, " ").trim().slice(0, 200) : null;
    return { title, gridTop: Number.isFinite(gridTop) ? Math.round(gridTop) : null, said };
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
      for (const [where, path] of [
        ["table", `/data-v2/${TABLE}`],
        ["list", "/data-v2"],
      ]) {
        await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
        // The page reads where the table lives, then the store; give it the time a person waits.
        await page
          .waitForSelector(where === "table" ? "table, [data-sheet-layout], [role='grid']" : "main a, main table", {
            timeout: 120000,
          })
          .catch(() => {});
        await sleep(6000);
        const shot = `${OUT}/${PHASE}-${where}-${seat}-${width}.png`;
        await page.screenshot({ path: shot });
        result[`${where}-${seat}-${width}`] = { shot, ...(await census(page)) };
        console.log(`${PHASE} ${where} ${seat} ${width}: ${shot}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/census-${PHASE}.json`, JSON.stringify(result, null, 2));
console.log(`census: ${OUT}/census-${PHASE}.json`);
