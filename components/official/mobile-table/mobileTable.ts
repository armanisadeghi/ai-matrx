/**
 * Mobile table treatment — the ONE horizontal-scroll recipe for bespoke tables.
 *
 * `MatrxDataTable` already does this internally, and migrating a table onto it
 * is always the better answer (you also get sort + filter + row actions). These
 * constants exist for the tables that legitimately stay bespoke — editable
 * grids, diff/comparison matrices, debug panels, print-shaped reports — so the
 * treatment is written once instead of hand-copied per table.
 *
 * Current rule (Arman, 2026-08-30): a table on a phone scrolls HORIZONTALLY as
 * ONE WHOLE ROW. No column freezes or pins over phone data, even when an older
 * call site imports one of the `*_FROZEN*` names below. Those names remain only
 * until the 53 existing consumers are mechanically renamed; their values
 * intentionally contain zero sticky positioning. The consumer cleanup is
 * tracked in `docs/handoffs/matrx-data-table-mobile-consumer-cleanup.md`.
 *
 * The two CSS traps these constants encode — do not rediscover them:
 *
 * 1. `app/globals.css` has an UNLAYERED `@media (max-width: 768px)` block with
 *    `* { max-width: 100% }` and `table { display: block; overflow-x: auto }`.
 *    Unlayered CSS beats Tailwind's layered utilities, so a plain `max-w-none`
 *    class cannot win — and the TABLE element (not its container) is the
 *    scroller below 768px.
 * 2. A base `w-full` outranks `max-sm:w-max`, so the width rule must be written
 *    MOBILE-FIRST (`w-max` base + `sm:w-full`), never as a `max-sm:` override.
 * Usage — ONE class on the `<table>` does the whole treatment:
 *
 *   <table className={cn("text-sm", MOBILE_TABLE_FROZEN)}> … </table>
 *
 * Reach for the granular constants below only when cells must keep wrapping or
 * an identity column needs a readable minimum width.
 */

/**
 * Historical export name; behavior is the default whole-row mobile scroll.
 * Content is sized below `sm`, cells stay on one line, and no cell is sticky.
 * A table whose cells hold prose must instead compose `MOBILE_TABLE` with
 * per-cell widths/wrapping so a paragraph does not become one enormous line.
 */
export const MOBILE_TABLE_FROZEN = [
  "w-max min-w-full max-w-none sm:w-full sm:min-w-0 sm:max-w-full",
  "max-sm:[&_th]:whitespace-nowrap max-sm:[&_td]:whitespace-nowrap",
].join(" ");

/**
 * The same whole-row scroll treatment through the tablet breakpoint. Use this
 * when a wide matrix still collapses at 768px and its tablet controls are
 * intentionally touch-sized. Desktop layout resumes at `lg`.
 */
export const MOBILE_TABLE_FROZEN_THROUGH_TABLET = [
  "max-lg:table max-lg:overflow-visible",
  "w-max min-w-full max-w-none lg:w-full lg:min-w-0 lg:max-w-full",
  "max-lg:[&_th]:whitespace-nowrap max-lg:[&_td]:whitespace-nowrap",
].join(" ");

/**
 * Historical second-column export. It now deliberately matches the default
 * whole-row scroll treatment; no column is pinned on a phone.
 */
export const MOBILE_TABLE_FROZEN_SECOND = [
  "w-max min-w-full max-w-none sm:w-full sm:min-w-0 sm:max-w-full",
  "max-sm:[&_th]:whitespace-nowrap max-sm:[&_td]:whitespace-nowrap",
].join(" ");

/**
 * On the `<table>` element. Below `sm` the table sizes to its CONTENT so it can
 * scroll horizontally; from `sm` up the desktop rendering is byte-identical to
 * a plain `w-full` table.
 */
export const MOBILE_TABLE =
  "w-max min-w-full max-w-none sm:w-full sm:min-w-0 sm:max-w-full";

/**
 * On a content-sized `<th>` / `<td>`. `whitespace-nowrap` (never `truncate` —
 * truncating clips the cell and defeats `w-max`, silently killing the scroll).
 */
export const MOBILE_TABLE_CELL = "max-sm:whitespace-nowrap";

/**
 * The same nowrap rule applied to EVERY cell from the `<table>` element for
 * tables that still want the one-line-per-cell layout. Pair with `MOBILE_TABLE`.
 * Do NOT use it on a table whose cells must wrap — a key/value pane, extracted
 * document text — there, per-cell `MOBILE_TABLE_CELL` is the honest tool.
 */
export const MOBILE_TABLE_NOWRAP_CELLS =
  "max-sm:[&_th]:whitespace-nowrap max-sm:[&_td]:whitespace-nowrap";

/** Historical export: gives the identity header readable width; never pins it. */
export const MOBILE_TABLE_FROZEN_HEAD = "max-sm:min-w-[160px]";

/**
 * Historical export: gives the identity body cell readable width; never pins
 * it. `min-w` (not `max-w`): the unlayered `* { max-width: 100% }` mobile rule
 * always beats a layered `max-w-*` utility.
 */
export const MOBILE_TABLE_FROZEN_CELL = "max-sm:min-w-[160px]";

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
