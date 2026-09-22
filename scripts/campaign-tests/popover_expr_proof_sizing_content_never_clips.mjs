// scripts/campaign-tests/popover_expr_proof_sizing_content_never_clips.mjs — lane POPOVER-EXPR
//
// Headless proof for the three `sizing="content"` adoptions this lane made on
// PopoverContent callers whose width lived inside an EXPRESSION className
// (cn()/ternary/template literal), invisible to the original guard's
// literal-only regex:
//   1. IconSelect          components/official/IconSelect.tsx
//   2. EntityTypeCombobox  components/entity-types/EntityTypeCombobox.tsx
//   3. RunControlShell     features/marketing/seo/topical-map/.../RunControlShell.tsx
//
// Harness: app/(dev)/demos/popover-expr-proof/page.dev.tsx mounts the REAL,
// unmodified components with realistic long content (Northbay Commercial
// Solar — synthesized, never a real person, per owner law). Proves at 1600
// and 375 wide: popover stays within the 28rem/viewport-gutter ceiling,
// stays inside the viewport, and (visually, via screenshot) never clips text
// mid-word.
//
// Run: node scripts/campaign-tests/popover_expr_proof_sizing_content_never_clips.mjs [origin]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3054";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
mkdirSync(OUT, { recursive: true });

const say = [];
let bad = 0;
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => { bad += 1; say.push(`FAIL  ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });

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
      overflowsViewport: box.left < -1 || box.right > vw + 1,
    };
  }, viewportWidth);
}

async function walk(section, trigger, label, width, height, shot) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${ORIGIN}/demos/popover-expr-proof`, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator(`[data-proof="${section}"]`).scrollIntoViewIfNeeded();
  await sleep(400);
  await trigger(page, section);
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

const openIconSelect = async (page, section) => {
  await page.locator(`[data-proof="${section}"] button`).first().click();
};
const openEntityType = async (page, section) => {
  await page.locator(`[data-proof="${section}"] button[role="combobox"]`).first().click();
};
const openRunControl = async (page, section) => {
  await page.locator(`[data-proof="${section}"] button`).first().click();
};

for (const width of [1600, 375]) {
  const height = width === 1600 ? 1000 : 812;
  await walk("icon-select", openIconSelect, `IconSelect @ ${width}`, width, height, `popover-expr-icon-select-${width}.png`);
  await walk("entity-type-combobox", openEntityType, `EntityTypeCombobox @ ${width}`, width, height, `popover-expr-entity-type-${width}.png`);
  await walk("run-control-shell", openRunControl, `RunControlShell @ ${width}`, width, height, `popover-expr-run-control-${width}.png`);
}

await browser.close();
console.log(say.join("\n"));
console.log(bad === 0 ? "\nALL CLAUSES PASSED" : `\n${bad} CLAUSE(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
