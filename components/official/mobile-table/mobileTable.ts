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
 * 3. The frozen cell must paint its OWN opaque background. `bg-inherit` on the
 *    cell plus an opaque row is the tempting shortcut and it fights every row
 *    tint the design already has — see the note on MOBILE_TABLE_FROZEN.
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
 * The opacity is on the frozen CELL (`bg-card` / `bg-muted`), never on the row.
 * Painting the row opaque is the obvious implementation and it is wrong twice
 * over: a variant tint (`hover:`, `even:`, `data-[state=selected]:`) still
 * out-specifies it and bleeds through anyway, while a plain tint loses and is
 * silently dropped — so a selected row stops looking selected on a phone. Tint
 * the row however the desktop design wants; only the frozen cell opts out.
 *
 * Two things it cannot do for you:
 * - A table whose first column is a checkbox or drag handle gets a useless
 *   anchor. Those need the granular constants on the identity column instead —
 *   freeze that one, and the narrow columns slide under it (or
 *   MOBILE_TABLE_FROZEN_SECOND when exactly one narrow column leads).
 * - A table whose cells hold PROSE — extracted document text, env values, a
 *   key/value pane — must keep wrapping, and the blanket nowrap here turns a
 *   paragraph into one enormous line that no amount of scrolling makes
 *   readable. Compose `MOBILE_TABLE` + `MOBILE_TABLE_FROZEN_CELL` on the
 *   identity column and give the cells a `max-sm:min-w-[…]` so they wrap
 *   without collapsing into slivers. A two-column key/value pane whose values
 *   already wrap is not a horizontal-scroll table at all — leave it alone.
 */
export const MOBILE_TABLE_FROZEN = [
  "w-max min-w-full max-w-none sm:w-full sm:min-w-0 sm:max-w-full",
  "max-sm:[&_th]:whitespace-nowrap max-sm:[&_td]:whitespace-nowrap",
  "max-sm:[&_thead_tr>*:first-child]:sticky max-sm:[&_thead_tr>*:first-child]:left-0 max-sm:[&_thead_tr>*:first-child]:z-20 max-sm:[&_thead_tr>*:first-child]:bg-muted",
  "max-sm:[&_tbody_tr>*:first-child]:sticky max-sm:[&_tbody_tr>*:first-child]:left-0 max-sm:[&_tbody_tr>*:first-child]:z-10 max-sm:[&_tbody_tr>*:first-child]:bg-card",
].join(" ");

/**
 * Same treatment, but freezing the SECOND column — for the very common shape
 * where a narrow control column (expand chevron, row index, icon) sits in front
 * of the identity column. The narrow first column simply scrolls under the
 * frozen one, which is what you want: freezing a 24px chevron is a useless
 * anchor.
 *
 * Use this whenever column 1 is not the thing that identifies the row. If the
 * identity column is third or later, or the table is checkbox-led and needs
 * BOTH the checkbox and the name pinned, that is the multi-cell freeze variant
 * — not built yet; those tables currently get horizontal scroll with no anchor.
 */
export const MOBILE_TABLE_FROZEN_SECOND = [
  "w-max min-w-full max-w-none sm:w-full sm:min-w-0 sm:max-w-full",
  "max-sm:[&_th]:whitespace-nowrap max-sm:[&_td]:whitespace-nowrap",
  "max-sm:[&_thead_tr>*:nth-child(2)]:sticky max-sm:[&_thead_tr>*:nth-child(2)]:left-0 max-sm:[&_thead_tr>*:nth-child(2)]:z-20 max-sm:[&_thead_tr>*:nth-child(2)]:bg-muted",
  "max-sm:[&_tbody_tr>*:nth-child(2)]:sticky max-sm:[&_tbody_tr>*:nth-child(2)]:left-0 max-sm:[&_tbody_tr>*:nth-child(2)]:z-10 max-sm:[&_tbody_tr>*:nth-child(2)]:bg-card",
].join(" ");

/**
 * On the `<table>` element. Below `sm` the table sizes to its CONTENT so it can
 * scroll horizontally; from `sm` up the desktop rendering is byte-identical to
 * a plain `w-full` table.
 */
export const MOBILE_TABLE =
  "w-max min-w-full max-w-none sm:w-full sm:min-w-0 sm:max-w-full";

/**
 * On every non-frozen `<th>` / `<td>`. `whitespace-nowrap` (never `truncate` —
 * truncating clips the cell and defeats `w-max`, silently killing the scroll).
 */
export const MOBILE_TABLE_CELL = "max-sm:whitespace-nowrap";

/**
 * The same nowrap rule applied to EVERY cell from the `<table>` element, for
 * tables that freeze a non-first column (so `MOBILE_TABLE_FROZEN` does not fit)
 * but still want the one-line-per-cell layout. Pair with `MOBILE_TABLE`.
 * Do NOT use it on a table whose cells must wrap — a key/value pane, extracted
 * document text — there, per-cell `MOBILE_TABLE_CELL` is the honest tool.
 */
export const MOBILE_TABLE_NOWRAP_CELLS =
  "max-sm:[&_th]:whitespace-nowrap max-sm:[&_td]:whitespace-nowrap";

/** On the first `<th>`. Freezes the header cell of the identity column. */
export const MOBILE_TABLE_FROZEN_HEAD =
  "max-sm:sticky max-sm:left-0 max-sm:z-20 max-sm:min-w-[160px] max-sm:bg-muted";

/**
 * On the identity `<td>` of every row. Opaque (`bg-card`), never `bg-inherit` —
 * see the note on MOBILE_TABLE_FROZEN. `min-w` (not `max-w`): the unlayered
 * `* { max-width: 100% }` mobile rule always beats a layered `max-w-*` utility.
 */
export const MOBILE_TABLE_FROZEN_CELL =
  "max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:min-w-[160px] max-sm:bg-card";

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
