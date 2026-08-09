/**
 * Mobile table treatment — the ONE frozen-first-column recipe for bespoke tables.
 *
 * `MatrxDataTable` already does this internally, and migrating a table onto it
 * is always the better answer (you also get sort + filter + row actions). These
 * constants exist for the tables that legitimately stay bespoke — editable
 * grids, diff/comparison matrices, debug panels, print-shaped reports — so the
 * treatment is written once instead of hand-copied per table.
 *
 * Chosen rule (Arman, 2026-07-18): a table on a phone scrolls HORIZONTALLY with
 * a FROZEN FIRST COLUMN. Never wrap every column into an unreadable mush, and
 * never let the table bleed off the viewport.
 *
 * The three CSS traps these constants encode — do not rediscover them:
 *
 * 1. `app/globals.css` has an UNLAYERED `@media (max-width: 768px)` block with
 *    `* { max-width: 100% }` and `table { display: block; overflow-x: auto }`.
 *    Unlayered CSS beats Tailwind's layered utilities, so a plain `max-w-none`
 *    class cannot win — and the TABLE element (not its container) is the
 *    scroller below 768px.
 * 2. A base `w-full` outranks `max-sm:w-max`, so the width rule must be written
 *    MOBILE-FIRST (`w-max` base + `sm:w-full`), never as a `max-sm:` override.
 * 3. A frozen cell uses `bg-inherit`, so its ROW needs an OPAQUE background
 *    (`MOBILE_TABLE_ROW`) or scrolled content shows through it. Translucent
 *    zebra/hover tints must be `sm:`-only for the same reason.
 *
 * Usage — ONE class on the `<table>` does the whole treatment:
 *
 *   <table className={cn("text-sm", MOBILE_TABLE_FROZEN)}> … </table>
 *
 * Reach for the granular constants below only when a table needs per-cell
 * control (dynamic columns where the identity column is not the first one,
 * cells that must keep wrapping, a header that is not `bg-muted`).
 */

/**
 * THE DEFAULT. One class on the `<table>`: content-sized below `sm`, cells
 * nowrap, rows opaque, first column of head and body frozen. Desktop
 * rendering is untouched.
 *
 * Two things it cannot do for you:
 * - A row tint written as a VARIANT — `hover:bg-accent/50`, `even:bg-muted/20`,
 *   `data-[state=selected]:bg-muted` — out-specifies the opaque background
 *   (a variant adds a pseudo-class; the descendant selector here is only one
 *   element deeper) and bleeds through the frozen cell. Gate those with `sm:`.
 *   A PLAIN tint (`bg-primary/5` on the row) loses to this rule and is simply
 *   dropped below `sm` — no bleed, but no tint either; write the mobile
 *   affordance some other way if it is load-bearing.
 * - A table whose first column is a checkbox or drag handle gets a useless
 *   anchor. Those need the granular constants on the identity column instead
 *   (freeze the identity column; the narrow ones slide under it).
 */
export const MOBILE_TABLE_FROZEN = [
  "w-max min-w-full max-w-none sm:w-full sm:min-w-0 sm:max-w-full",
  "max-sm:[&_th]:whitespace-nowrap max-sm:[&_td]:whitespace-nowrap",
  "max-sm:[&_tbody_tr]:bg-card",
  "max-sm:[&_thead_tr>*:first-child]:sticky max-sm:[&_thead_tr>*:first-child]:left-0 max-sm:[&_thead_tr>*:first-child]:z-20 max-sm:[&_thead_tr>*:first-child]:bg-muted",
  "max-sm:[&_tbody_tr>*:first-child]:sticky max-sm:[&_tbody_tr>*:first-child]:left-0 max-sm:[&_tbody_tr>*:first-child]:z-10 max-sm:[&_tbody_tr>*:first-child]:bg-inherit",
].join(" ");

/**
 * On the `<table>` element. Below `sm` the table sizes to its CONTENT so it can
 * scroll horizontally; from `sm` up the desktop rendering is byte-identical to
 * a plain `w-full` table.
 */
export const MOBILE_TABLE =
  "w-max min-w-full max-w-none sm:w-full sm:min-w-0 sm:max-w-full";

/**
 * On a `<tr>` in `<tbody>`. Gives the frozen first cell an opaque background to
 * inherit. `sm:bg-transparent` hands the row back to whatever the desktop
 * design (zebra, hover, selection) wants.
 */
export const MOBILE_TABLE_ROW = "bg-card sm:bg-transparent";

/**
 * On every non-frozen `<th>` / `<td>`. `whitespace-nowrap` (never `truncate` —
 * truncating clips the cell and defeats `w-max`, silently killing the scroll).
 */
export const MOBILE_TABLE_CELL = "max-sm:whitespace-nowrap";

/** On the first `<th>`. Freezes the header cell of the identity column. */
export const MOBILE_TABLE_FROZEN_HEAD =
  "max-sm:sticky max-sm:left-0 max-sm:z-20 max-sm:min-w-[160px] max-sm:bg-muted";

/**
 * On the first `<td>` of every row. `min-w` (not `max-w`): the unlayered
 * `* { max-width: 100% }` mobile rule always beats a layered `max-w-*` utility.
 */
export const MOBILE_TABLE_FROZEN_CELL =
  "max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:min-w-[160px] max-sm:bg-inherit";

/**
 * No wrapper constant, deliberately. Below 768px the global rule makes the
 * `table` ELEMENT its own scroller and `* { max-width: 100% }` keeps it inside
 * its parent — so an ancestor `overflow-hidden` does not clip it, and adding
 * `overflow-x-auto` to the wrapper only creates a second, competing scroller.
 * Leave the wrapper alone.
 *
 * (`MatrxDataTable` takes the other valid route: it forces real table layout
 * back on with `table overflow-visible` and scrolls its own container. Don't
 * mix the two strategies in one table.)
 */
