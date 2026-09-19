/**
 * THE MOBILE RULE-ROW SQUEEZE GUARD.
 *
 * Defect (independent re-verify 2026-09-19,
 * common-docs/projects/acquisition-frontier/screen-reverify-2026-09-19/README.md
 * claim b): on a rule row at 390x844 (dark), the row's action buttons
 * squeezed the provenance text column to zero width and the browser wrapped
 * "Chapter 1. Accepting a Load at the Gate · at 0:02–0:08" one character per
 * line — reproduced on Rulebook 950b80c1-7dc5-4542-b776-d977eed7d3d5.
 *
 * Root cause: `RuleRow`'s outer row
 * (features/masterwork/components/detail/RulebookDetailPage.tsx) had no
 * `flex-wrap`, so the text button (`min-w-0 flex-1`) and the action buttons
 * (`shrink-0 flex-nowrap`) fought for one line's width and the text column
 * lost. Fix: the row wraps (`flex-wrap`), and the action buttons are `w-full`
 * (their own line) with an internal `flex-wrap` below `sm` — the exact
 * responsive pattern already used two hundred lines below in the same file
 * for the Rulebook header (`min-w-0 flex-1 basis-full sm:basis-0` /
 * `ml-auto shrink-0 ... sm:ml-0`).
 *
 * jsdom computes no layout, so this spec drives a REAL Chromium against a
 * static fixture carrying the row's ACTUAL class strings (`fixture.html`) and
 * the REAL compiled Tailwind CSS (`build-css.mjs`, run by `global-setup.ts`)
 * — never a hand-simulated approximation. #buggyRow reproduces the row's
 * classes exactly as they were before this fix; #fixedRow carries its current
 * classes. Both proofs live in the same run: the guard is shown failing
 * against the old shape and passing against the new one without touching git
 * history.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";

const FIXTURE = "file://" + path.join(__dirname, "fixture.html");

/** Roughly the row's text-xs line-height (Tailwind `text-xs` = 1rem/16px at
 * the default root size) — "under 3 line-heights" per the brief means this
 * one-line provenance string must never render past a short, bounded wrap. */
const LINE_HEIGHT_PX = 16;
const MAX_HEIGHT_PX = LINE_HEIGHT_PX * 3;

test.describe("mobile rule-row squeeze (390x844, dark)", () => {
  test("BEFORE the fix: the provenance text wraps far past 3 line-heights", async ({ page }) => {
    await page.goto(FIXTURE);
    const height = await page.locator("#buggyProvenance").evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    // This is the defect: the squeezed column wraps one character per line,
    // producing a tall, un-navigable column of text. Asserting it EXCEEDS the
    // bound (rather than a huge fixed number) is what makes this proof, not
    // a coincidence — the buggy fixture must fail the same assertion the
    // fixed one passes.
    expect(height).toBeGreaterThan(MAX_HEIGHT_PX);
  });

  test("AFTER the fix: the provenance text stays under 3 line-heights", async ({ page }) => {
    await page.goto(FIXTURE);
    const height = await page.locator("#fixedProvenance").evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeLessThan(MAX_HEIGHT_PX);
  });

  test("AFTER the fix: the text column keeps a real minimum width", async ({ page }) => {
    await page.goto(FIXTURE);
    const width = await page.locator("#fixedProvenance").evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    // The squeezed defect drives width toward ~0; a healthy row gives the
    // provenance line most of the card's inner width at 390px.
    expect(width).toBeGreaterThan(200);
  });
});
