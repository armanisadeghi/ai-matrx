/**
 * WHAT THE SHEET'S BODY SHOWS WHILE IT READS (DATA-V2-BASICS-2 C3).
 *
 * The skeleton is for a table with nothing on screen yet. A re-read while rows are showing — a
 * colour picked, a live notice from another person, a sort — used to swap every row for five
 * pulsing bars for a second, so a colour change looked like it emptied the table. Rows on screen
 * stay; the body says it is re-reading (`aria-busy`, dimmed) until the answer lands.
 */
export type SheetBodyState = "skeleton" | "rereading" | "rows";

export function sheetBodyState(args: { loading: boolean; rowsHeld: number; filteringInProgress: boolean }): SheetBodyState {
  if (args.filteringInProgress) return "skeleton";
  if (args.loading) return args.rowsHeld === 0 ? "skeleton" : "rereading";
  return "rows";
}
