/**
 * THE SHEET'S ONE TOOLBAR ROW FITS ITS WIDTH (lane DATA-V2-BASICS-2, 2026-09-28).
 *
 * MEASURED on /data-v2 (Clinic Supplies Count, the Sheet): the row needs about 1300 px with every
 * tool's words. At 1600 the last two tools (Colors, Get reference) sat under the page's own
 * settings and "…" buttons; at 1280 Reorder, Clean, Colors and Get reference were past the row's
 * edge, reachable only by scrolling a row that shows no scrollbar. Now, when the words do not fit,
 * the row's tools show their icons alone (each keeps its name for hover and for a screen reader);
 * the words come back once the row is as wide as it was when they last fitted.
 *
 * The decision is pure so its hysteresis is provable: the row never flips back and forth at one
 * width, because it returns to words only at the width the words were measured to need.
 */
export type SheetToolbarFit = { compact: boolean; wordsNeed: number };

export function nextSheetToolbarFit(
  was: SheetToolbarFit,
  row: { clientWidth: number; scrollWidth: number },
): SheetToolbarFit {
  if (!was.compact) {
    // Words showing: too wide for the row means icons, remembering what the words needed.
    return row.scrollWidth > row.clientWidth + 1 ? { compact: true, wordsNeed: row.scrollWidth } : was;
  }
  // Icons showing: the words return only when the row is as wide as they needed.
  return row.clientWidth >= was.wordsNeed ? { compact: false, wordsNeed: 0 } : was;
}
