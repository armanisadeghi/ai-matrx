// scripts/campaign-tests/fix14_relation_picker_popover_never_clips_a_name.mjs — lane FIX-14
//
// THE ONE CONTROL WHOSE JOB IS TO SHOW THE NAME MUST SHOW THE NAME.
//
// FIX-13 left this named and not fixed: in `fix13-relation-4-create-offer.png` the
// relation picker's offer reads
//
//     Create “Marisol Okonkwo — 418 Calle Pu
//
// cut mid-word, because `RelationPicker` pasted a per-surface `w-64` over the design
// system's popover and the Create button had no truncation of its own. A fixed width is
// never right for content nobody chose the length of.
//
// THE USE CASE (owner law — no fake test data). Rincon Plumbing Co's dispatcher takes a
// call from a homeowner who has never used them before and has to write the job now, so
// the customer has to be created from inside the job's Customer cell. The name she types
// is an ordinary Ventura-County one: a person and a street address on one line.
// Synthesized person, real address shape — never a real customer.
//
// WHAT IT PROVES, headlessly, on @ai-matrx/records-ui SOURCE (the product still runs the
// published 0.79.0; publishing is blocked tonight by the org's Actions budget):
//
//   at 1600×1000 and again at the mobile preset (375 wide):
//     · the popover is WIDER than the old 16rem box and no wider than its ceiling;
//     · it never runs off the viewport;
//     · the offer's own text either fits or ends in a real ellipsis (`…` painted by
//       text-overflow, measured by comparing scrollWidth to clientWidth) — never a
//       mid-word cut;
//     · the WHOLE name is reachable: the control carries it as its `title`.
//
// Run: node scripts/campaign-tests/fix14_relation_picker_popover_never_clips_a_name.mjs [origin]
// The origin defaults to the records-ui demo harness on lane FIX-14's port (3052),
// started with `RECORDS_UI_DEMO_PORT=3052 npx vite --config demo/vite.config.ts` inside
// aidream/apps/shared/records-ui. Headless always; it never opens a window.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3052";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const LONG_NAME = "Marisol Okonkwo — 418 Calle Puerto Vallarta, Camarillo";
mkdirSync(OUT, { recursive: true });

const say = [];
let bad = 0;
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => { bad += 1; say.push(`FAIL  ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });

/** One viewport, end to end: open the picker, type the long name, measure the offer. */
async function walk(label, width, height, shot) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${ORIGIN}/?demo=grid`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("tbody tr", { timeout: 120000 });
  // The columns arrive after the rows do — the fields, the records and the relation
  // words are three separate door calls against the live store, and a click fired
  // before the last of them lands hits a skeleton.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("thead th")).some((t) => /assignee/i.test(t.textContent ?? "")),
    undefined,
    { timeout: 120000 },
  );
  await sleep(6000);

  // The Assignee column is this table's relation onto the kernel Person table. A click on
  // the cell opens the cell EDITOR (Pick · Save · Cancel); the picker is behind Pick —
  // the two steps FIX-13 had to write down because a walk kept missing them.
  const headers = await page.$$eval("thead th", (ths) => ths.map((t) => (t.textContent ?? "").trim()));
  const column = headers.findIndex((h) => /^assignee$/i.test(h));
  if (column === -1) {
    fail(`${label}: the demo table has no Assignee relation column (headers: ${headers.join(", ")})`);
    await ctx.close();
    return;
  }
  const cell = page.locator("tbody tr").first().locator("td").nth(column);
  await cell.click();
  await sleep(600);
  const pick = page.getByRole("button", { name: /^Pick for /i }).first();
  if ((await pick.count()) === 0) {
    fail(`${label}: the cell editor offered no Pick control`);
    await ctx.close();
    return;
  }
  await pick.click();
  await sleep(900);

  const search = page.getByPlaceholder("Search").first();
  await search.fill(LONG_NAME);
  await sleep(1200);

  const offer = page.getByRole("button", { name: new RegExp(`^Create`) }).first();
  if ((await offer.count()) === 0) {
    fail(`${label}: no Create offer appeared for a name that is not in that table`);
    await page.screenshot({ path: `${OUT}/${shot}` });
    await ctx.close();
    return;
  }

  const measured = await offer.evaluate((el, viewportWidth) => {
    const popover = el.closest("[data-radix-popper-content-wrapper]")?.firstElementChild ?? el.closest("div[role]") ?? el.parentElement;
    const inner = el.querySelector("span") ?? el;
    const box = (popover ?? el).getBoundingClientRect();
    const style = getComputedStyle(inner);
    return {
      popoverWidth: Math.round(box.width),
      popoverLeft: Math.round(box.left),
      popoverRight: Math.round(box.right),
      viewportWidth,
      title: el.getAttribute("title") ?? "",
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      overflow: style.overflow,
      innerScrollWidth: Math.round(inner.scrollWidth),
      innerClientWidth: Math.round(inner.clientWidth),
      text: (el.textContent ?? "").trim(),
    };
  }, width);

  await page.screenshot({ path: `${OUT}/${shot}` });

  // 1. The popover grew past the old fixed 16rem box (256px) — or, on a phone, is as wide
  //    as the viewport honestly allows.
  const ceiling = Math.min(384, width - 32);
  if (measured.popoverWidth > 256 || ceiling <= 256) ok(`${label}: popover is ${measured.popoverWidth}px (old fixed box was 256px, ceiling here is ${ceiling}px)`);
  else fail(`${label}: popover is still ${measured.popoverWidth}px — it did not grow past the old 256px box`);

  // 2. It is on the screen.
  if (measured.popoverLeft >= -1 && measured.popoverRight <= width + 1) ok(`${label}: popover sits inside the viewport (${measured.popoverLeft}…${measured.popoverRight} of ${width})`);
  else fail(`${label}: popover runs off the viewport (${measured.popoverLeft}…${measured.popoverRight} of ${width})`);

  // 3. It fits, or it ends in a REAL ellipsis. Never a mid-word cut.
  const overflowing = measured.innerScrollWidth > measured.innerClientWidth + 1;
  if (!overflowing) {
    ok(`${label}: the whole offer fits — "${measured.text}"`);
  } else if (measured.textOverflow === "ellipsis" && measured.whiteSpace === "nowrap") {
    ok(`${label}: the offer overflows by ${measured.innerScrollWidth - measured.innerClientWidth}px and ends in an ellipsis (text-overflow: ellipsis)`);
  } else {
    fail(`${label}: the offer overflows by ${measured.innerScrollWidth - measured.innerClientWidth}px with text-overflow: ${measured.textOverflow} — that is a mid-word cut`);
  }

  // 4. The whole name is reachable even when the line is shortened.
  if (measured.title.includes(LONG_NAME)) ok(`${label}: the control carries the whole name as its title`);
  else fail(`${label}: the control's title does not carry the whole name (title: "${measured.title}")`);

  if (errors.length === 0) ok(`${label}: 0 page errors`);
  else fail(`${label}: ${errors.length} page error(s): ${errors[0]}`);

  await ctx.close();
}

await walk("desktop 1600×1000", 1600, 1000, "fix14-relation-picker-desktop-1600.png");
await walk("mobile 375", 375, 812, "fix14-relation-picker-mobile-375.png");

await browser.close();
console.log(say.join("\n"));
console.log(bad === 0 ? "\nALL CLAUSES PASSED" : `\n${bad} CLAUSE(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
