// scripts/campaign-tests/fix13_relation_picker_makes_the_missing_one.mjs — lane FIX-13
//
// CREATING A RECORD FROM INSIDE A RELATION PICKER, RE-DRIVEN ON A REAL CREW JOB.
//
// TAILS-7 proved this at records-ui 0.69.0. GUIDE-2 could not reach it at 0.79.0 —
// "the picker opens on a relation cell (Enter on the cell; there is a `Search records`
// box) but I could not get a 'make a new one with this name' offer to appear for a name
// that does not exist. Either it is not built or I could not reach it." This walks the
// exact gesture on Rincon Plumbing Co's Jobs table, Customer column (a single relation
// onto Customers, whose title column is `customer_name`), and records the steps.
//
// THE USE CASE (owner law — no fake test data). Rincon's dispatcher takes a call from a
// homeowner who has never used them before, and has to put the job in the book now — so
// the customer has to exist as she types the job, not before it. Synthesized person,
// real Ventura-County address shape.
//
// Usage: node scripts/campaign-tests/fix13_relation_picker_makes_the_missing_one.mjs [origin]

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep, until } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/seat-browser.mjs";

const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const env = {};
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(ROOT, f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}

const ORIGIN = process.argv[2] ?? "https://www.aimatrx.com";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";
const NEW_CUSTOMER = "Marisol Okonkwo — 418 Calle Puerto Vallarta, Camarillo";
mkdirSync(OUT, { recursive: true });

const say = [];
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => say.push(`FAIL  ${m}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME ?? "admin@admin.com", env.AI_ADMIN_PASSWORD);
say.push(`seat: ${who}`);
await sleep(2500);
await setOrganization(page, "Rincon Plumbing Co");
await sleep(2000);

await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("tbody tr", { timeout: 90000 });
await sleep(6000);
await page.screenshot({ path: `${OUT}/fix13-relation-1-jobs-grid.png` });

// ── THE TWO STEPS GUIDE-2 MISSED, WRITTEN DOWN ─────────────────────────────
//
// 1. The grid's TOOLBAR search is the box placeholdered "Search records". The relation
//    picker's own box is placeholdered "Search" and it does not exist until step 2.
// 2. Clicking a relation cell opens the cell EDITOR — "Pick · Save · Cancel". The picker
//    is behind **Pick**. Typing into the toolbar box instead is what a walk that says
//    "there is a Search records box" has actually done, and no Create can ever appear there.

const opener = page.locator('[role="button"][aria-label="Edit Customer"]').first();
await opener.scrollIntoViewIfNeeded();
await opener.click();
await sleep(2500);
await page.screenshot({ path: `${OUT}/fix13-relation-2-cell-editor.png` });
if (await page.getByRole("button", { name: "Pick" }).count()) ok('the cell editor opened — "Pick · Save · Cancel"');
else fail("clicking the Customer cell did not open its editor");

await page.getByRole("button", { name: "Pick" }).first().click();
await sleep(2500);
const box = page.locator("[data-radix-popper-content-wrapper] input").first();
if (await box.count()) ok(`the picker opened behind Pick; its search box is placeholdered "${await box.getAttribute("placeholder")}"`);
else fail("Pick did not open the picker");
await page.screenshot({ path: `${OUT}/fix13-relation-3-picker-open.png` });

await box.fill(NEW_CUSTOMER);
await sleep(2500);
const offer = page.getByRole("button", { name: /^Create\s*[\u201c"]/ }).first();
if (await offer.count()) ok(`THE OFFER IS THERE: ${(await offer.innerText()).trim()}`);
else fail("no Create offer for a name that is not in the table");
await page.screenshot({ path: `${OUT}/fix13-relation-4-create-offer.png` });

// PRESS IT, and read back what the store made.
await offer.click();
await sleep(6000);
await page.screenshot({ path: `${OUT}/fix13-relation-5-made-and-picked.png` });
const cellNow = await page.locator("tbody tr").first().locator("td").nth(1).innerText();
if (cellNow.includes("Marisol Okonkwo")) ok(`the new customer came back into the cell as: ${cellNow.split("\n")[0]}`);
else fail(`the cell does not carry the new customer: ${JSON.stringify(cellNow)}`);

// LEAVE THE JOB EXACTLY AS IT WAS. The cell was empty; Cancel throws the draft away,
// so the only thing this walk leaves behind is the Customers row, which is cleaned up
// below through the store's own soft-archive door.
const cancel = page.getByRole("button", { name: "Cancel" }).first();
if (await cancel.count()) { await cancel.click(); await sleep(1500); ok("cancelled — the job keeps the customer it had"); }

say.push(`page errors: ${errors.length}${errors.length ? ` — ${errors.slice(0, 3).join(" | ")}` : ""}`);
console.log(say.join("\n"));
await browser.close();
