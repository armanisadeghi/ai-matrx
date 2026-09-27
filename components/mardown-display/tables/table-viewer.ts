// components/mardown-display/tables/table-viewer.ts
//
// WHO IS LOOKING AT THIS TABLE, AND HOW IT READS ON A PHONE — shared by both
// table renderers (MarkdownTable, StreamingTableRenderer).
//
// 1. A signed-out visitor (an AI result on a public /p/<slug> page) cannot
//    write: saving as a data table, a workbook or a Google Sheet, and editing
//    the message, each failed with 401 / "permission denied". Those controls
//    are ABSENT for her, never dead (`canWrite`).
// 2. On a phone the table reflows into the PHONE-STACK card list
//    (app/globals.css, ios-mobile-first rule 10): each row a card, each cell
//    labelled by its column — never a strip of truncated cells paged sideways.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";

export function useTableViewer(): { canWrite: boolean } {
  const signedIn = useAppSelector(selectIsAuthenticated);
  return { canWrite: signedIn };
}

/** A header cell's markdown as the plain words a phone-card label shows. */
export function plainHeaderLabel(header: string): string {
  return header
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The PHONE-STACK attributes for one body cell. The first column is the card's
 * headline (no label); every other cell is labelled with its column.
 */
export function phoneStackCellProps(
  headers: readonly string[],
  colIndex: number,
): { "data-phone"?: "lead"; "data-label"?: string } {
  if (colIndex === 0) return { "data-phone": "lead" };
  const label = plainHeaderLabel(headers[colIndex] ?? "");
  return label ? { "data-label": label } : {};
}
