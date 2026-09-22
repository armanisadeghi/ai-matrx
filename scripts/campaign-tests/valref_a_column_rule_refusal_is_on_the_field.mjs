// scripts/campaign-tests/valref_a_column_rule_refusal_is_on_the_field.mjs — lane VALIDATION-REFUSAL
//
// A COLUMN'S OWN REFUSAL MUST LAND ON THE FIELD, WITH A REMEDY, AND STAY THERE.
//
// FIX-15 gave the STORE's refusals an honest surface on the older Data screens and named, in
// its own report, what it left behind: "the column's own VALIDATION refusal is still a toast
// — a rule the person can still fix keeps the editor open holding what they typed". A value
// a COLUMN refuses never reaches the store, so the store never answers, so FIX-15's notice
// never fired: the person got a destructive toast carrying one line, on a timer, while the
// editor sat open holding text nobody had told them what was wrong with.
//
// THE USE CASE (owner law — no fake test data). Rincon Plumbing & Drain numbers every work
// order `WO-4473`, and the office manager has declared that on the Work order column so a
// typo is caught where it is made. A dispatcher, on the dispatch board at 7am, types a
// customer's own reference into that cell instead. That is the refusal under test.
//
// WHAT IT PROVES, at 1600×1000 and at 375 wide, on the live store as admin@admin.com:
//   1  the notice is on screen, and no toast fired
//   2  it says what happened AND what to do — the store's own `refused_by_rule` shape
//   3  the column's rules are on it, in the author's own words, verbatim
//   4  Keep editing and Discard are both there and hit-testable
//   5  the notice is drawn OUTSIDE the table (FIX-13's geometry lesson, re-measured here)
//   6  it is still there nine seconds later — nothing about it is on a timer
//   7  Discard puts the STORED value back, and the store was never called
//   8  the SAME notice, with no editor doors, is what the row modal draws
//
// Run: node scripts/campaign-tests/valref_a_column_rule_refusal_is_on_the_field.mjs [origin]

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { signIn, sleep } from "../lib/seat-browser.mjs";

const env = {};
for (const f of [
  "/Users/armanisadeghi/code/matrx-frontend/.env",
  "/Users/armanisadeghi/code/matrx-frontend/.env.local",
]) {
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
const A_REFERENCE_THAT_IS_NOT_A_WORK_ORDER = "Takeda PM ref 88213";
mkdirSync(OUT, { recursive: true });

const say = [];
let bad = 0;
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => {
  bad += 1;
  say.push(`FAIL  ${m}`);
};

const browser = await chromium.launch({ headless: true });

/** One whole walk at one width, so the narrow screen is measured and not assumed. */
async function walk(width, height, tag) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const writes = [];
  page.on("request", (r) => {
    if (r.url().includes("udt_upsert_cell")) writes.push(r.url());
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  say.push(
    `[${tag}] seat: ${await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME ?? "admin@admin.com", env.AI_ADMIN_PASSWORD)}`,
  );
  await sleep(2500);
  await page.goto(`${ORIGIN}/data/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("tbody tr", { timeout: 180000 });
  await sleep(6000);

  const heads = await page.locator("thead th").allInnerTexts();
  const col = heads.findIndex((h) => /work order/i.test(h));
  if (col < 0) {
    fail(`[${tag}] no Work order column on this board (${JSON.stringify(heads)})`);
    await ctx.close();
    return;
  }
  const cell = page.locator("tbody tr").first().locator("td").nth(col);
  const stored = (await cell.innerText()).trim();
  ok(`[${tag}] the cell holds ${JSON.stringify(stored)} before the walk`);

  // THE CLICK LAW: a text column needs a deliberate second gesture to open its editor.
  await cell.click();
  await sleep(600);
  await cell.dblclick();
  await sleep(1500);
  const editor = cell.locator("textarea, input").first();
  if ((await editor.count()) === 0) {
    fail(`[${tag}] the cell never opened an editor`);
    await ctx.close();
    return;
  }
  await editor.fill(A_REFERENCE_THAT_IS_NOT_A_WORK_ORDER);
  await sleep(400);
  await editor.press("Enter");
  await sleep(2500);

  // 1. THE NOTICE IS ON SCREEN, AND THE STORE WAS NEVER ASKED.
  const notice = page.locator("[data-matrx-cell-refusal]").first();
  if ((await notice.count()) === 0) {
    fail(`[${tag}] the refusal is nowhere on the screen — the cell says nothing`);
    await page.screenshot({ path: `${OUT}/valref-${tag}-0-nothing-on-screen.png` });
    await ctx.close();
    return;
  }
  ok(`[${tag}] the refusal is on the cell`);
  if (writes.length === 0) ok(`[${tag}] the store was never called — the column refused it first`);
  else fail(`[${tag}] the refused value still went to udt_upsert_cell ${writes.length} time(s)`);

  // What a PERSON reads: `RefusalNotice` keeps an engineer's line in the DOM, aria-hidden
  // and sr-only, so reading `textContent` would judge text nobody can see.
  const read = await notice.evaluate((el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("[data-for-engineers]").forEach((n) => n.remove());
    return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  });
  say.push(`[${tag}] a person reads: ${JSON.stringify(read)}`);

  // 2. WHAT HAPPENED, AND WHAT TO DO.
  if (/That value was not accepted/.test(read)) ok(`[${tag}] the notice names what happened`);
  else fail(`[${tag}] the notice never says what happened`);
  if (/Correct it and save again, or discard what you typed/.test(read))
    ok(`[${tag}] the notice says what to do`);
  else fail(`[${tag}] the notice is a dead end — no remedy`);

  // 3. THE COLUMN'S OWN RULES, VERBATIM.
  const rules = await page
    .locator("[data-matrx-column-rules]")
    .first()
    .innerText()
    .catch(() => "");
  if (/WO-4473/.test(rules) && /At most 8 characters/.test(rules))
    ok(`[${tag}] the column's rules are on the notice: ${JSON.stringify(rules.trim())}`);
  else fail(`[${tag}] the rules the person has to satisfy are not on the notice (${JSON.stringify(rules)})`);

  // 4. TWO DOORS, BOTH REACHABLE.
  for (const [what, sel] of [
    ["Keep editing", "[data-matrx-refusal-keep-editing]"],
    ["Discard", "[data-matrx-refusal-discard]"],
  ]) {
    const b = page.locator(sel).first();
    if ((await b.count()) === 0) {
      fail(`[${tag}] no ${what} control`);
      continue;
    }
    const box = await b.boundingBox();
    if (!box) {
      fail(`[${tag}] ${what} has no geometry`);
      continue;
    }
    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);
    const hit = await page.evaluate(
      ([x, y, s]) => {
        const at = document.elementFromPoint(x, y);
        return Boolean(at && at.closest(s));
      },
      [cx, cy, sel],
    );
    if (hit && cx > 0 && cx < width) ok(`[${tag}] ${what} is hit-testable at ${cx},${cy}`);
    else fail(`[${tag}] ${what} sits at ${cx},${cy} in a ${width}px viewport and nothing answers there`);
  }

  // 5. OUTSIDE THE TABLE — FIX-13's lesson, measured rather than assumed.
  const geometry = await notice.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      inTable: Boolean(el.closest("table")),
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: `${Math.round(r.left)}…${Math.round(r.right)}`,
      y: `${Math.round(r.top)}…${Math.round(r.bottom)}`,
    };
  });
  if (!geometry.inTable)
    ok(
      `[${tag}] the notice is outside <table>, ${geometry.w}×${geometry.h} at ${geometry.x} × ${geometry.y} of ${width}×${height}`,
    );
  else fail(`[${tag}] the notice is INSIDE the table and the scroll container will clip it`);

  await page.screenshot({ path: `${OUT}/valref-${tag}-1-grid-cell-refusal.png` });

  // 6. NOTHING IS ON A TIMER.
  await sleep(9000);
  if ((await page.locator("[data-matrx-cell-refusal]").count()) > 0)
    ok(`[${tag}] the notice is still on screen nine seconds later`);
  else fail(`[${tag}] the notice disappeared on its own — a refusal on a timer is a refusal nobody read`);

  // 7. DISCARD PUTS THE STORED VALUE BACK.
  await page.locator("[data-matrx-refusal-discard]").first().click();
  await sleep(2000);
  const after = (await cell.innerText()).trim();
  if (after === stored) ok(`[${tag}] Discard put ${JSON.stringify(stored)} back in the cell`);
  else fail(`[${tag}] after Discard the cell reads ${JSON.stringify(after)}, not the stored ${JSON.stringify(stored)}`);
  if (writes.length === 0) ok(`[${tag}] nothing was written to the store by this whole walk`);
  else fail(`[${tag}] ${writes.length} write(s) reached udt_upsert_cell`);

  // 8. THE SAME NOTICE IN THE ROW MODAL — the record form of these screens.
  const edit = page.locator('button[title="Edit Row"]').first();
  if ((await edit.count()) === 0) {
    say.push(`[${tag}] NOT MEASURED: no Edit row control found on the row menu at this width`);
  } else {
    await edit.click();
    await sleep(3000);
    const field = page.locator('[role="dialog"] input, [role="dialog"] textarea').first();
    await field.fill(A_REFERENCE_THAT_IS_NOT_A_WORK_ORDER);
    await sleep(400);
    const save = page.getByRole("button", { name: /^(Save|Save changes|Update)/ }).first();
    await save.click();
    await sleep(2500);
    const inForm = page.locator('[data-matrx-field-rule-refusal]').first();
    if ((await inForm.count()) === 0) {
      fail(`[${tag}] the row modal refused the value and drew no notice`);
    } else {
      const formRead = await inForm
        .evaluate((el) => (el.closest('[role="alert"], .space-y-1')?.parentElement?.textContent ?? el.textContent ?? "").replace(/\s+/g, " ").trim())
        .catch(() => "");
      ok(`[${tag}] the row modal draws the same notice: ${JSON.stringify(formRead.slice(0, 200))}`);
      if ((await page.locator('[role="dialog"] [data-matrx-refusal-keep-editing]').count()) === 0)
        ok(`[${tag}] and offers no editor doors — the value is in a field the person can already fix`);
      else fail(`[${tag}] the row modal offered Keep editing / Discard, which belong to an open cell editor`);
      await page.screenshot({ path: `${OUT}/valref-${tag}-2-row-modal-refusal.png` });
    }
    await page.keyboard.press("Escape");
  }

  if (pageErrors.length > 0) fail(`[${tag}] ${pageErrors.length} page error(s): ${pageErrors[0]}`);
  else ok(`[${tag}] 0 page errors`);

  await ctx.close();
}

await walk(1600, 1000, "1600");
await walk(375, 812, "375");
await browser.close();

console.log(say.join("\n"));
console.log(bad === 0 ? `\nALL GREEN — ${say.filter((l) => l.startsWith("ok")).length} clauses.` : `\n${bad} FAILED.`);
process.exit(bad === 0 ? 0 : 1);
