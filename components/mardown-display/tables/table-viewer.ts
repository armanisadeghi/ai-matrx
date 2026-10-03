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

/**
 * THE PHONE-STACK reflow for a NARROW CANVAS PANE. The globals.css rule is a
 * viewport media query, and a canvas pane can be 360px wide on a 1,600px
 * desktop — a media query cannot see it. The canvas tells the block instead
 * (`useCanvasFit() === "narrow"`), and the block puts THIS on the element whose
 * direct child is the `<table>`: the same card list (header row hidden, each
 * row a card, the first cell its headline, every other cell labelled by its
 * column from `phoneStackCellProps`). Keep the two in step.
 */
export const CANVAS_STACK_CARDS = [
  "[&>table]:block [&>table]:w-full [&>table>tbody]:block [&>table>tbody]:w-full",
  "[&>table>thead]:hidden",
  "[&>table>tbody>tr]:flex [&>table>tbody>tr]:w-full [&>table>tbody>tr]:flex-wrap [&>table>tbody>tr]:items-center",
  "[&>table>tbody>tr]:gap-x-3 [&>table>tbody>tr]:gap-y-1.5 [&>table>tbody>tr]:px-3 [&>table>tbody>tr]:py-2.5",
  "[&>table>tbody>tr>td]:block [&>table>tbody>tr>td]:min-w-0 [&>table>tbody>tr>td]:basis-full [&>table>tbody>tr>td]:p-0 [&>table>tbody>tr>td]:text-left",
  "[&>table>tbody>tr>td[data-phone=lead]]:-order-1 [&>table>tbody>tr>td[data-phone=lead]]:font-medium",
  "[&>table>tbody>tr>td[data-label]]:before:mb-0.5 [&>table>tbody>tr>td[data-label]]:before:block [&>table>tbody>tr>td[data-label]]:before:text-[0.625rem] [&>table>tbody>tr>td[data-label]]:before:font-medium [&>table>tbody>tr>td[data-label]]:before:uppercase [&>table>tbody>tr>td[data-label]]:before:leading-none [&>table>tbody>tr>td[data-label]]:before:tracking-wide [&>table>tbody>tr>td[data-label]]:before:text-muted-foreground [&>table>tbody>tr>td[data-label]]:before:content-[attr(data-label)]",
].join(" ");
