/**
 * THE LIBRARY TABLE REACHABILITY GUARD.
 *
 * Defect: D4, cold-walk-12
 * (common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/
 * cold-walk-12/README.md + screenshots/45_table_in_view.png). At 1440x900 on
 * a catalogued Library (`/libraries/<id>`), the episode table was
 * unreachable: `document.scrollingElement.scrollHeight === clientHeight ===
 * 900`, the first `<tbody>` row's rect was `top: 876, bottom: 917` (24px
 * visible, rows 2-25 gone), and NO scrollable ancestor contained the
 * `<tbody>` — the pagination control above it ("1-25 of 507") worked while
 * making it impossible to see or click a row. Twelve mouse-wheel scrolls
 * moved nothing.
 *
 * Root cause: `notice` in `lib/entity-list/components/EntityListPage.tsx`
 * renders bare inside the STATIC `shrink-0` zone above the scope tabs and
 * toolbar. `LibraryMetricsHeader` — 5 fixed `h-[84px]` stat tiles plus two
 * fixed `h-[276px]` chart sections that never shrink or collapse — can fill
 * nearly the whole viewport there, leaving the table's `flex-1 min-h-0
 * overflow-y-auto` scroll body almost nothing to occupy: `min-h-0` lets that
 * body compute a near-zero height instead of visibly overflowing, so the row
 * renders a sliver with no usable scrollbar and no scrollable ancestor.
 *
 * Fix (in the SHARED primitive, not the Library page): `notice` is now
 * wrapped in `max-h-[42vh] overflow-y-auto` (scrolls on its own, however
 * tall), and the table's scroll body is floored at `min-h-[16rem]` instead
 * of `min-h-0` (still shrinks — its own overflow still engages — but never
 * below a workable slice of table). Every other `EntityListPage` consumer's
 * notice is far under 42vh, so nothing about them changes.
 *
 * jsdom computes no layout, so this spec drives a REAL Chromium against a
 * static fixture carrying `EntityListPage`'s and `LibraryMetricsHeader`'s
 * ACTUAL class strings (`fixture.html`) and the REAL compiled Tailwind CSS
 * (`build-css.mjs`, run by `global-setup.ts`) — never a hand-simulated
 * approximation. `?variant=buggy` loads the page's OLD classes; `?variant=fixed`
 * loads the CURRENT ones. Both viewports the brief pinned are covered:
 * 1440x900 (where the walk reproduced it) and 390x844 (mobile, already fine
 * and must stay fine).
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const FIXTURE = "file://" + path.join(__dirname, "fixture.html");

/** A row's screen worth: the guard's floor for "genuinely usable" — a
 * container has to show more than a sliver of one row before scrolling it
 * means anything. The walk measured the real defect's sliver at 24px (one
 * row, 41px tall, mostly cut); this is deliberately looser than that and
 * still fails on the fixture's own buggy numbers (41px / 16px). */
const MIN_USABLE_PX = 100;

/** A "scrollable ancestor" per the brief: scrollHeight > clientHeight, a
 * computed overflow-y of auto/scroll, AND enough visible height to actually
 * scroll something into view (see `MIN_USABLE_PX`). */
async function firstScrollableAncestor(
  page: Page,
  rowSelector: string,
): Promise<{ id: string; clientHeight: number; scrollHeight: number } | null> {
  return page.evaluate(
    ({ selector, minUsablePx }) => {
      let node = document.querySelector(selector) as HTMLElement | null;
      while (node) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        if (
          (overflowY === "auto" || overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight &&
          node.clientHeight >= minUsablePx
        ) {
          return {
            id: node.id || node.tagName.toLowerCase(),
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
          };
        }
        node = node.parentElement;
      }
      return null;
    },
    { selector: rowSelector, minUsablePx: MIN_USABLE_PX },
  );
}

/** A small, realistic wheel-scroll amount (a few ticks), never "to the very
 * end" — scrolling a genuinely tiny container all the way down would carry
 * ROW 1 itself off the top, which proves nothing about reachability. */
async function nudgeScroll(page: Page, containerId: string, deltaPx: number) {
  await page.evaluate(
    ({ id, delta }) => {
      const el = document.getElementById(id);
      if (el) el.scrollTop += delta;
    },
    { id: containerId, delta: deltaPx },
  );
}

for (const viewport of [
  { name: "1440x900 (desktop — where the walk reproduced it)", width: 1440, height: 900 },
  { name: "390x844 (mobile — must stay fine)", width: 390, height: 844 },
] as const) {
  test.describe(`library table reachability — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: "dark" });

    test("BEFORE the fix: no scrollable ancestor contains the table row, and the row is not reachable", async ({
      page,
    }) => {
      await page.goto(`${FIXTURE}?variant=buggy`);
      const rowSelector = "#buggyTbody tr:first-child";

      const ancestor = await firstScrollableAncestor(page, rowSelector);
      expect(
        ancestor,
        "no ancestor should offer a genuinely usable scroll area (the walk's own finding)",
      ).toBeNull();

      const before = await page.locator(rowSelector).evaluate((el) => el.getBoundingClientRect().bottom);
      expect(before, "row 1 must not already be fully visible").toBeGreaterThan(viewport.height);

      // The walk's own instrumented number for the real defect: the scroll
      // body computed to a sliver, not a genuine scroll area — mirrored here
      // as "the squeezed container's own box is under the usable floor",
      // which is exactly why the ancestor search above came back null.
      const squeezed = await page.locator("#buggyScrollArea").evaluate((el) => el.clientHeight);
      expect(squeezed, "the scroll body must be squeezed to a sliver, not a usable area").toBeLessThan(
        MIN_USABLE_PX,
      );
    });

    test("AFTER the fix: the table has a real scrollable ancestor and the row is reachable", async ({ page }) => {
      await page.goto(`${FIXTURE}?variant=fixed`);
      const rowSelector = "#fixedTbody tr:first-child";

      const ancestor = await firstScrollableAncestor(page, rowSelector);
      expect(ancestor, "a genuinely usable scrollable ancestor must exist").not.toBeNull();
      expect(ancestor!.id).toBe("fixedScrollArea");
      expect(ancestor!.clientHeight).toBeGreaterThanOrEqual(200);

      // Reachable with NO scrolling at all: the floored scroll body is tall
      // enough that row 1's bottom is already fully inside the viewport —
      // the exact opposite of the buggy sliver above.
      const bottom = await page.locator(rowSelector).evaluate((el) => el.getBoundingClientRect().bottom);
      expect(bottom, "row 1 must be fully visible without scrolling").toBeLessThanOrEqual(viewport.height);
      expect(bottom).toBeGreaterThan(0);

      // And scrolling the real scroll area a normal wheel-amount brings
      // LATER rows into view too — the container is genuinely navigable,
      // not just tall enough to show row 1 by coincidence.
      await nudgeScroll(page, "fixedScrollArea", 300);
      const laterRowTop = await page
        .locator("#fixedTbody tr:nth-child(10)")
        .evaluate((el) => el.getBoundingClientRect().top);
      expect(laterRowTop, "scrolling must bring later rows toward the visible area").toBeLessThan(
        viewport.height,
      );
    });

    test("AFTER the fix: a tall notice scrolls on its own and never disappears", async ({ page }) => {
      await page.goto(`${FIXTURE}?variant=fixed`);
      const notice = page.locator("#fixedRoot .max-h-\\[42vh\\]");
      const box = await notice.evaluate((el) => ({
        clientHeight: (el as HTMLElement).clientHeight,
        scrollHeight: (el as HTMLElement).scrollHeight,
      }));
      // The real LibraryMetricsHeader content here is well over 42vh tall —
      // proving the cap actually bites, rather than happening to already fit.
      expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
      expect(box.clientHeight).toBeLessThanOrEqual(Math.ceil(viewport.height * 0.42) + 1);
    });
  });
}
