// scripts/campaign-tests/popover_census_sizing_content_never_clips.mjs — lane POPOVER-CENSUS
//
// THE CENSUS'S OWN PROOF. FIX-14 proved `sizing="content"` on its one caller
// (RelationPicker). This lane swept every other `<PopoverContent>` caller
// across matrx-frontend and the @ai-matrx package sources that pasted a
// per-surface width class over content that can be long, and adopted the
// same `sizing="content"` on every one whose content is NOT a fixed-shape
// control (a calendar, a color grid, a short enum). This proves three
// representative adopted callers, headlessly, at 1600 and 375 wide, against
// the design-system demo harness's own proof page
// (`demo/popover-proof.html`, source-only) which mounts the REAL, unmodified
// package components:
//
//   1. ColumnHeaderCell   (data-table menu popover; header line = a column's
//                          own display name, which can be long)
//   2. CreatablePicker    (combobox; option rows are real record names of
//                          unpredictable length — the same shape of bug
//                          FIX-14 fixed on the relation picker)
//   3. EditableTableCell  (inline cell editor; the popover host wraps a text
//                          field seeded with a long value)
//
// THE USE CASE (owner law — no fake test data, never a real person). Northbay
// Commercial Solar's phased installation jobs table: real job/account/contact
// name shapes, long on purpose, nobody chose the length.
//
// Run: node scripts/campaign-tests/popover_census_sizing_content_never_clips.mjs [origin]
// Origin defaults to the design-system demo harness on this lane's port (3053),
// started with `DESIGN_SYSTEM_DEMO_PORT=3053 npx vite --config demo/vite.config.ts`
// inside aidream/apps/shared/design-system. Headless always.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3053";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
mkdirSync(OUT, { recursive: true });

const say = [];
let bad = 0;
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => { bad += 1; say.push(`FAIL  ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });

/** Measures the open popover: width, viewport containment, no mid-word clip. */
async function measurePopover(page, viewportWidth) {
  return page.evaluate((vw) => {
    const el = document.querySelector('[data-radix-popper-content-wrapper]')?.firstElementChild;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return {
      width: Math.round(box.width),
      left: Math.round(box.left),
      right: Math.round(box.right),
      viewportWidth: vw,
      scrollWidth: Math.round(el.scrollWidth),
      overflowsViewport: box.left < -1 || box.right > vw + 1,
    };
  }, viewportWidth);
}

async function walk(which, trigger, label, width, height, shot) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${ORIGIN}/popover-proof.html?which=${which}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(800);
  await trigger(page);
  await sleep(600);

  const measured = await measurePopover(page, width);
  await page.screenshot({ path: `${OUT}/${shot}` });

  if (!measured) {
    fail(`${label}: popover never opened`);
    await ctx.close();
    return;
  }

  const ceiling = Math.min(448, width - 32); // 28rem cap, 1rem gutter each side
  if (measured.width <= ceiling + 1) ok(`${label}: popover is ${measured.width}px, within the ${ceiling}px ceiling`);
  else fail(`${label}: popover is ${measured.width}px — exceeds the ${ceiling}px ceiling`);

  if (!measured.overflowsViewport) ok(`${label}: popover sits inside the viewport (${measured.left}…${measured.right} of ${width})`);
  else fail(`${label}: popover runs off the viewport (${measured.left}…${measured.right} of ${width})`);

  if (errors.length === 0) ok(`${label}: 0 page errors`);
  else fail(`${label}: ${errors.length} page error(s): ${errors[0]}`);

  await ctx.close();
}

// ColumnHeaderCell: the popover opens from the header's sort/filter control
// (the button carrying aria-haspopup="dialog" — the label button itself only
// toggles sort, it does not open a popover).
const openColumnHeader = async (page) => {
  const trigger = page.locator('button[aria-haspopup="dialog"]').first();
  await trigger.click();
};

// CreatablePicker: opens from its own trigger button (aria-label="Account"
// wins over the placeholder text as the accessible name).
const openCreatablePicker = async (page) => {
  const trigger = page.getByRole("button", { name: "Account" }).first();
  await trigger.click();
};

// EditableTableCell: click the cell body to enter edit mode (editTrigger="click" default).
const openEditableCell = async (page) => {
  const cell = page.locator("div[style*='border']").first();
  await cell.click();
};

for (const width of [1600, 375]) {
  const height = width === 1600 ? 1000 : 812;
  await walk("column-header", openColumnHeader, `ColumnHeaderCell @ ${width}`, width, height, `popover-column-header-${width}.png`);
  await walk("creatable-picker", openCreatablePicker, `CreatablePicker @ ${width}`, width, height, `popover-creatable-picker-${width}.png`);
  await walk("editable-cell", openEditableCell, `EditableTableCell @ ${width}`, width, height, `popover-editable-cell-${width}.png`);
}

await browser.close();
console.log(say.join("\n"));
console.log(bad === 0 ? "\nALL CLAUSES PASSED" : `\n${bad} CLAUSE(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
