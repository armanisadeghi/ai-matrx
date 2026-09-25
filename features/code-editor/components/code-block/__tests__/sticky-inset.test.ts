/**
 * verify-RC-B9 F5: a code block's floating Collapse/Copy controls sat ON TOP of
 * the conversation toolbar (Find, Pinned, Export) — a click on "Show only
 * pinned" copied code instead. Sticky chrome in the same scroller declares
 * itself (`data-sticky-chrome`), and the floating controls rest BELOW it.
 */

import { stickyRestInset } from "../sticky-inset";

it("rests below the app header when nothing else is stuck", () => {
  expect(stickyRestInset({ headerBottom: 56, restTop: 40, chromeHeights: [] })).toBe(16);
  expect(stickyRestInset({ headerBottom: 0, restTop: 40, chromeHeights: [] })).toBe(0);
});

it("rests below every sticky chrome row in the scroller", () => {
  expect(stickyRestInset({ headerBottom: 0, restTop: 40, chromeHeights: [32] })).toBe(32);
  expect(stickyRestInset({ headerBottom: 56, restTop: 40, chromeHeights: [32, 8] })).toBe(56);
});
