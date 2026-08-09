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
 * Usage:
 *
 *   <table className={MOBILE_TABLE}>
 *     <thead><tr>
 *       <th className={cn(MOBILE_TABLE_FROZEN_HEAD, "px-3 py-2")}>Name</th>
 *       <th className={cn(MOBILE_TABLE_CELL, "px-3 py-2")}>Status</th>
 *     </tr></thead>
 *     <tbody>{rows.map((r) => (
 *       <tr key={r.id} className={cn(MOBILE_TABLE_ROW, "border-b")}>
 *         <td className={cn(MOBILE_TABLE_FROZEN_CELL, "px-3 py-2")}>{r.name}</td>
 *         <td className={cn(MOBILE_TABLE_CELL, "px-3 py-2")}>{r.status}</td>
 *       </tr>
 *     ))}</tbody>
 *   </table>
 */

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
 * For tables rendered inside a scroll container that is NOT the page body
 * (a dialog, a panel, a card with `overflow-hidden`): the global mobile rule
 * only turns the `table` itself into a scroller, so an ancestor that clips
 * would hide the overflow. Put this on the immediate wrapper.
 */
export const MOBILE_TABLE_WRAPPER = "max-sm:overflow-x-auto";
