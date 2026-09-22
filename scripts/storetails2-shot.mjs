/**
 * STORE-TAILS-2 — the headless proof of F5 on a real crew table.
 *
 * Greenline Landscaping Crew's Jobs board, signed in as admin@admin.com through the login
 * form (no dev-login nonce, no cookie forced from outside), on the shared dev server. It
 * reads the "Job label" column before a write, writes a Service Type on one job, reloads,
 * and reads it again — the whole of "it reads as words after a write and a reload".
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { signIn, setOrganization, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "http://storetails2.localhost:3001";
const ORG = "Greenline Landscaping Crew";
const JOBS = "182fef5a-4ead-42a0-966b-e4e88fcd87a9";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.AI_ADMIN_USERNAME;
const PASSWORD = process.env.AI_ADMIN_PASSWORD;

async function labels(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("body *"))
      .map((n) => (n.childElementCount === 0 ? (n.textContent || "").trim() : ""))
      .filter((t) => /^GL-\d{4}/.test(t))
      .slice(0, 8),
  );
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
try {
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD);
  console.log("signed in as:", who);
  await setOrganization(page, ORG);
  await page.goto(`${ORIGIN}/data/${JOBS}?ps=50`, { waitUntil: "domcontentloaded" });
  const first = await until("the Job label column", async () => (await labels(page)).find((t) => t.includes(" — ")));
  console.log("BEFORE:", first.v ?? "(none)", `${first.ms}ms`);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/storetails2-f5-jobs-grid${process.env.SHOT_SUFFIX ?? ""}.png`, fullPage: false });

  // A RELOAD, and the same words. (The write itself went through the store door as the seat;
  // this is the screen reading it back cold.)
  await page.reload({ waitUntil: "domcontentloaded" });
  const after = await until("the Job label column after reload", async () => (await labels(page)).find((t) => t.includes(" — ")));
  console.log("AFTER RELOAD:", after.v ?? "(none)", `${after.ms}ms`);
  console.log("ALL:", JSON.stringify(await labels(page)));
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/storetails2-f5-jobs-grid-after-reload${process.env.SHOT_SUFFIX ?? ""}.png`, fullPage: false });
} finally {
  await browser.close();
}
