/**
 * WHERE PROTEXTAREA'S MIC + "…" CLUSTER SITS, and the rule that it never covers
 * text (the ProTextarea twin of `proInputReservedPadding.ts`, page-pass 2026-09-27).
 *
 * A textarea's lines run the full width, so the cluster cannot take a right
 * gutter; it sits in a bottom ROW the field reserves (`pb-11`) on every
 * pointer. Mic, "…" and the submit button share ONE flex row inset 4px from
 * the corner, so they sit as adjacent tap boxes — no hand-typed offset between
 * them (a 48px offset beside a 38px box left a 10px hole, 2026-10-05).
 */
export type ClusterRow = "top" | "bottom";

export interface ClusterPlacement {
  row: ClusterRow;
  /** Distance from the right edge, px (clears the submit button when they share a row). */
  rightPx: number;
  /** The rows the field reserves, per pointer kind. */
  reserved: { fine: ClusterRow[]; coarse: ClusterRow[] };
  /** The submit button's row and width, when there is one. */
  submit: { row: ClusterRow; widthPx: number } | null;
  /** The classes the cluster container adds. */
  className: string;
}

/** The tap box (`--matrx-tap-box`, 38px since 2026-10-01). */
export const SUBMIT_BUTTON_WIDTH_PX = 38;

export function proTextareaClusterPlacement(hasSubmit: boolean): ClusterPlacement {
  // One flex row inset 4px from the bottom-right corner: the hover part, then
  // the submit button. They are adjacent tap boxes in the SAME row, so the
  // cluster sits exactly one submit box (plus the inset) from the edge.
  return {
    row: "bottom",
    rightPx: hasSubmit ? SUBMIT_BUTTON_WIDTH_PX + 4 : 4,
    reserved: { fine: ["bottom"], coarse: ["bottom"] },
    submit: hasSubmit ? { row: "bottom", widthPx: SUBMIT_BUTTON_WIDTH_PX } : null,
    className: "bottom-1 right-1",
  };
}

/** Every way a placement lets the cluster cover text or the submit button. `[]` = sound. */
export function clusterPlacementProblems(p: ClusterPlacement): string[] {
  const problems: string[] = [];
  if (!p.reserved.fine.includes(p.row)) {
    problems.push(`on a fine pointer the ${p.row} row is not reserved, so the cluster covers text on hover`);
  }
  if (!p.reserved.coarse.includes(p.row)) {
    problems.push(`on a touch screen the ${p.row} row is not reserved, so the cluster covers text`);
  }
  if (p.submit && p.submit.row === p.row && p.rightPx < p.submit.widthPx) {
    problems.push("the cluster overlaps the submit button");
  }
  return problems;
}
