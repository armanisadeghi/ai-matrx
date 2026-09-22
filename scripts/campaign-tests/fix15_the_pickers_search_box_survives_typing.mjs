// scripts/campaign-tests/fix15_the_pickers_search_box_survives_typing.mjs — lane FIX-15
//
// THE PICKER'S OWN SEARCH BOX MUST SURVIVE BEING TYPED INTO.
//
// GUIDE-3, on production (build 93970125f9, records-ui 0.81.0): pressing the relation
// picker's `Search` box destroyed the whole picker. A real mouse click left
// `document.activeElement` a grid DIV outside the popover; the Create offer FIX-14 had
// just un-clipped was unreachable by any person.
//
// THE CAUSE, measured on this package's own harness and fixed in the design system:
// React synthetic events propagate through the REACT tree, not the DOM tree. A Radix
// Popover portals its content to `document.body`, but that content is still a React child
// of the table cell that opened it — so the mousedown inside the picker was delivered to
// `useSpreadsheetGrid`'s `cellProps.onMouseDown`, whose `preventDefault()` stopped the
// input taking focus and whose `focus()` moved focus to the spreadsheet scroll container.
// Radix saw focus leave its layer and dismissed the picker. `camePastAPortal` in
// `design-system/src/data-table/useSpreadsheetGrid.ts` now ignores any mouse, key or
// clipboard event whose real DOM target is not inside the element the handler is bound to.
//
// THE USE CASE (owner law — no fake test data). Northbay Commercial Solar runs phased
// commercial jobs whose proposals point at each other; a coordinator opens a proposal's
// "Related proposal" cell and narrows a long list of real project titles by typing. The
// demo harness seeds exactly that table.
//
// WHAT THIS PROVES, headlessly, at 1600×1000 and at 375 wide, against the live store:
//   · a REAL MOUSE CLICK on the picker's Search box leaves focus in that box;
//   · typing THREE characters keeps the popover open and attached, with the characters in
//     the box — the picker is usable at all, which it was not;
//   · the Create offer for a name that is not in that table is on screen and hit-testable.
//
// Run: node scripts/campaign-tests/fix15_the_pickers_search_box_survives_typing.mjs [origin]
// Origin defaults to the records-ui demo harness on lane FIX-15's port (3056), started with
//   RECORDS_UI_DEMO_PORT=3056 npx vite --config demo/vite.config.ts
// inside aidream/apps/shared/records-ui. Headless always; it never opens a window.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3056";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
const TYPED = "Mil"; // three characters — "Mill Creek School District — six rooftop arrays"
mkdirSync(OUT, { recursive: true });

const say = [];
let bad = 0;
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => { bad += 1; say.push(`FAIL  ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });

const readState = (page) =>
  page.evaluate(() => {
    const wrapper = document.querySelector("[data-radix-popper-content-wrapper]");
    const content = wrapper?.firstElementChild ?? null;
    const box = document.querySelector('[data-radix-popper-content-wrapper] input[placeholder="Search"]');
    const rect = content?.getBoundingClientRect();
    const active = document.activeElement;
    return {
      popovers: document.querySelectorAll("[data-radix-popper-content-wrapper]").length,
      attached: wrapper ? document.body.contains(wrapper) : false,
      width: rect ? Math.round(rect.width) : 0,
      left: rect ? Math.round(rect.left) : 0,
      right: rect ? Math.round(rect.right) : 0,
      typed: box instanceof HTMLInputElement ? box.value : null,
      activeIsTheSearchBox: active === box,
      activeTag: active ? `${active.tagName}${active.getAttribute("placeholder") ? `[${active.getAttribute("placeholder")}]` : ""}` : "none",
    };
  });

async function walk(label, width, height, shot) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // The GRID — not the form. The defect only exists inside a spreadsheet-enabled
  // `MatrxDataTable`, because only there does a cell bind mouse handlers that a
  // portalled child's events can reach.
  await page.goto(`${ORIGIN}/?demo=grid`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const opener = page.locator('[aria-label="Edit Related proposal"]').first();
  await opener.waitFor({ state: "visible", timeout: 120000 });
  await sleep(1500);
  await opener.scrollIntoViewIfNeeded();
  await opener.click();
  await sleep(1000);

  const pick = page.locator('button[aria-label^="Pick for Related proposal"]').first();
  if ((await pick.count()) === 0) {
    fail(`${label}: the relation cell's editor did not open`);
    await ctx.close();
    return;
  }
  await pick.click();
  await sleep(2500);

  const opened = await readState(page);
  if (opened.popovers === 1 && opened.attached) ok(`${label}: the picker opened (${opened.width}px, ${opened.left}…${opened.right} of ${width})`);
  else fail(`${label}: the picker did not open (${JSON.stringify(opened)})`);

  // ── THE PRESS. A real mouse click, which is the gesture that destroyed it.
  const box = page.locator('[data-radix-popper-content-wrapper] input[placeholder="Search"]').first();
  await box.click();
  await sleep(600);
  const clicked = await readState(page);
  if (clicked.popovers === 1 && clicked.attached) ok(`${label}: a real click on the Search box left the picker standing`);
  else fail(`${label}: a real click on the Search box destroyed the picker (${JSON.stringify(clicked)})`);
  if (clicked.activeIsTheSearchBox) ok(`${label}: focus is in the Search box after the click`);
  else fail(`${label}: focus went to ${clicked.activeTag} instead of the Search box`);

  // ── THREE CHARACTERS.
  await page.keyboard.type(TYPED, { delay: 120 });
  await sleep(1500);
  const typed = await readState(page);
  if (typed.popovers === 1 && typed.attached) ok(`${label}: the picker is still open after typing "${TYPED}"`);
  else fail(`${label}: typing "${TYPED}" destroyed the picker (${JSON.stringify(typed)})`);
  if (typed.typed === TYPED) ok(`${label}: the box carries what was typed ("${typed.typed}")`);
  else fail(`${label}: the box carries ${JSON.stringify(typed.typed)}, not "${TYPED}"`);
  if (typed.activeIsTheSearchBox) ok(`${label}: focus is still in the Search box`);
  else fail(`${label}: focus left the Search box while typing (now ${typed.activeTag})`);

  // ── AND FIX-14'S OFFER IS REACHABLE AT LAST.
  const offer = page.locator('[data-radix-popper-content-wrapper] button', { hasText: /^Create\s*[“"]/ }).first();
  try { await offer.waitFor({ state: "visible", timeout: 30000 }); } catch {}
  if ((await offer.count()) === 0) {
    fail(`${label}: no Create offer appeared for a name that is not in that table`);
  } else {
    const seen = await offer.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return {
        text: (el.textContent ?? "").trim(),
        width: Math.round(r.width),
        height: Math.round(r.height),
        hitTestable: el.contains(hit) || el === hit,
      };
    });
    if (seen.width > 0 && seen.height > 0 && seen.hitTestable) ok(`${label}: the Create offer is on screen and pressable — ${seen.text}`);
    else fail(`${label}: the Create offer is drawn but not reachable (${JSON.stringify(seen)})`);
  }

  await page.screenshot({ path: `${OUT}/${shot}` });
  if (errors.length === 0) ok(`${label}: 0 page errors`);
  else fail(`${label}: ${errors.length} page error(s): ${errors[0]}`);
  await ctx.close();
}

await walk("desktop 1600×1000", 1600, 1000, "fix15-relation-picker-typing-desktop-1600.png");
await walk("mobile 375", 375, 812, "fix15-relation-picker-typing-mobile-375.png");

await browser.close();
console.log(say.join("\n"));
console.log(bad === 0 ? "\nALL CLAUSES PASSED" : `\n${bad} CLAUSE(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
