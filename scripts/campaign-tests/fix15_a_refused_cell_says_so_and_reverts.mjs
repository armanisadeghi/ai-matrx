// scripts/campaign-tests/fix15_a_refused_cell_says_so_and_reverts.mjs — lane FIX-15
//
// A CELL THE STORE REFUSED MUST SAY SO, AND MUST NOT KEEP WEARING THE REFUSED TEXT.
//
// GUIDE-3, on production (build 93970125f9): on an older Data screen, choosing
// `Use "Marisol Okonkwo Property Care"` in a RELATION column was refused by
// `custom.udt_upsert_cell` with a good three-part sentence —
//
//   22P02 · "Customer points at a record, and it was given the text '…'"
//         · "Column 'customer' of this table is a relation: its cell holds the identifier
//            of the record it points at, not that record's name."
//         · hint: "Look the record up first and write its id…"
//
// — and the person got one destructive toast carrying one third of that sentence, which
// then timed out, while the CELL went on showing the rejected text until the page was
// reloaded. Two breaches in one gesture: nothing fails silently, and a screen never lies.
//
// THE FIX, both halves in matrx-frontend (no package publish needed):
//   · `features/data-tables/service.ts` keeps the whole refusal (`mapPgError` from
//     `@ai-matrx/records/core`) instead of only `PostgrestError.message`;
//   · `EditableCell` draws it through `RefusalNotice` — the ONE refusal surface the
//     unified grid already uses — on the cell, with a Dismiss and no timer, and puts the
//     STORED value back.
//
// THE USE CASE (owner law — no fake test data). Rincon Plumbing & Drain's dispatcher is
// looking at the dispatch board and types a new property manager's company name straight
// into the Customer column, which points at the Customers table. That is the real mistake
// a real dispatcher makes, and the store's answer is the teaching moment.
//
// Run: node scripts/campaign-tests/fix15_a_refused_cell_says_so_and_reverts.mjs [origin]
// Origin defaults to the machine-wide dev server (http://localhost:3001). Headless always.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { signIn, sleep } from "../lib/seat-browser.mjs";

const env = {};
for (const f of ["/Users/armanisadeghi/code/matrx-frontend/.env", "/Users/armanisadeghi/code/matrx-frontend/.env.local"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}

const ORIGIN = process.argv[2] ?? "http://localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
// Rincon Plumbing & Drain's dispatch board, on the older Data screens.
const TABLE = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const A_NAME_NOT_AN_ID = "Marisol Okonkwo Property Care";
mkdirSync(OUT, { recursive: true });

const say = [];
let bad = 0;
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => { bad += 1; say.push(`FAIL  ${m}`); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const refusedCalls = [];
page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("udt_upsert_cell")) refusedCalls.push(r.status()); });

say.push(`seat: ${await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME ?? "admin@admin.com", env.AI_ADMIN_PASSWORD)}`);
await sleep(2500);
await page.goto(`${ORIGIN}/data/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForSelector("tbody tr", { timeout: 180000 });
await sleep(6000);

const heads = await page.locator("thead th").allInnerTexts();
const customer = heads.findIndex((h) => /customer/i.test(h));
if (customer < 0) { fail(`no Customer column on this board (${JSON.stringify(heads)})`); }
const cell = page.locator("tbody tr").first().locator("td").nth(customer);
const stored = (await cell.innerText()).trim();
ok(`the cell holds ${JSON.stringify(stored)} before the walk`);

// THE CLICK LAW: the first click selects, the second opens the chooser.
await cell.click();
await sleep(900);
await cell.click();
await sleep(2000);
if ((await page.locator('input[placeholder="Search or type a value…"]').count()) === 0) {
  await page.keyboard.press("Enter");
  await sleep(2000);
}
const box = page.locator('input[placeholder="Search or type a value…"]').first();
if ((await box.count()) === 0) fail("the chooser never opened on the Customer cell");
else ok("the chooser opened on the Customer cell");
await box.fill(A_NAME_NOT_AN_ID);
await sleep(1500);

const use = page.getByRole("option", { name: /^Use/ }).first();
if ((await use.count()) === 0) fail(`no "Use …" offer for ${JSON.stringify(A_NAME_NOT_AN_ID)}`);
else ok(`the chooser offers ${JSON.stringify((await use.innerText()).trim())}`);
await use.click();
await sleep(6000);

// 1. THE STORE REFUSED IT.
if (refusedCalls.length > 0) ok(`the store refused the write (HTTP ${refusedCalls.join(", ")} on udt_upsert_cell)`);
else fail("udt_upsert_cell was never refused — this walk proves nothing");

// 2. THE SENTENCE IS ON THE CELL, and it is the STORE'S sentence.
const notice = page.locator("[data-matrx-cell-refusal]").first();
if ((await notice.count()) === 0) {
  fail("the refusal is nowhere on the screen — the cell says nothing");
} else {
  // WHAT A PERSON ACTUALLY READS. `RefusalNotice` keeps an engineer's line in the DOM
  // for debugging, `aria-hidden` and `sr-only` — out of the accessibility tree AND out of
  // sight — so a clause that reads `textContent` would be judging the wrong text.
  const seen = await notice.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const copy = el.cloneNode(true);
    for (const hidden of copy.querySelectorAll("[data-for-engineers], .sr-only, [aria-hidden='true']")) hidden.remove();
    return { text: (copy.textContent ?? "").replace(/\s+/g, " ").trim(), width: Math.round(r.width), height: Math.round(r.height) };
  });
  if (seen.width > 0 && seen.height > 0) ok(`the refusal is drawn on the cell (${seen.width}x${seen.height})`);
  else fail(`the refusal is in the DOM with no geometry (${JSON.stringify(seen)})`);
  if (/relation|identifier|points at/i.test(seen.text)) ok(`it is the store's own sentence: "${seen.text.slice(0, 220)}"`);
  else fail(`the notice does not carry the store's sentence: "${seen.text.slice(0, 220)}"`);
  // A screen never prints the machine's word at a person.
  if (/22P02|udt_upsert_cell|PGRST|SQLSTATE/i.test(seen.text)) fail(`the notice prints machine identity at the person: "${seen.text.slice(0, 220)}"`);
  else ok("no SQLSTATE, no door name, no package name is printed at the person");
  // It is not on a timer.
  await sleep(9000);
  if ((await page.locator("[data-matrx-cell-refusal]").count()) > 0) ok("nine seconds later it is still there — it is not a toast on a timer");
  else fail("the refusal disappeared on its own");
}

// 3. THE CELL WENT BACK TO WHAT THE STORE ACTUALLY HOLDS.
// The cell's own DISPLAY, not the notice hanging under it — the notice quotes the text
// the store refused, which is the point of it.
const after = (await cell.evaluate((el) => {
  const copy = el.cloneNode(true);
  for (const n of copy.querySelectorAll("[data-matrx-cell-refusal]")) n.remove();
  return (copy.textContent ?? "").trim();
})).trim();
if (after.includes(A_NAME_NOT_AN_ID)) fail(`the cell is still wearing the refused text: ${JSON.stringify(after)}`);
else if (after.startsWith(stored)) ok(`the cell went back to the stored value: ${JSON.stringify(after.split("\n")[0])}`);
else fail(`the cell shows neither the refused text nor the stored value: ${JSON.stringify(after)}`);

await page.screenshot({ path: `${OUT}/fix15-refused-cell-says-so.png` });

// 4. AND THE STORE REALLY DID NOT TAKE IT.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("tbody tr", { timeout: 180000 });
await sleep(5000);
const reloaded = (await page.locator("tbody tr").first().locator("td").nth(customer).innerText()).trim();
if (reloaded.startsWith(stored)) ok(`after a reload the cell still reads ${JSON.stringify(reloaded.split("\n")[0])} — nothing was written`);
else fail(`after a reload the cell reads ${JSON.stringify(reloaded)}`);

await browser.close();
console.log(say.join("\n"));
console.log(bad === 0 ? "\nALL CLAUSES PASSED" : `\n${bad} CLAUSE(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
