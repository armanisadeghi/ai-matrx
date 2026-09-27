/**
 * WHERE PROTEXTAREA'S MIC + "…" CLUSTER SITS, and the rule that it never covers
 * text (the ProTextarea twin of `proInputReservedPadding.ts`, page-pass 2026-09-27).
 *
 * A textarea's lines run the full width, so the cluster cannot take a right
 * gutter; it must sit in a ROW the field reserves. Without a submit button the
 * field reserves a bottom row on every pointer (`pb-10`, `pointer-coarse:pb-12`).
 * With one, the field already reserves a 44px bottom row for the submit button
 * (`pb-14`) — the cluster used to sit at the TOP instead, where a fine pointer
 * reserves nothing, so on hover it covered the first line's last words. It now
 * shares the submit row, to the button's left.
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

export const SUBMIT_BUTTON_WIDTH_PX = 44;

export function proTextareaClusterPlacement(hasSubmit: boolean): ClusterPlacement {
  if (hasSubmit) {
    return {
      row: "bottom",
      rightPx: 48,
      reserved: { fine: ["bottom"], coarse: ["bottom"] },
      submit: { row: "bottom", widthPx: SUBMIT_BUTTON_WIDTH_PX },
      className: "top-auto bottom-0 right-12",
    };
  }
  return {
    row: "bottom",
    rightPx: 0,
    reserved: { fine: ["bottom"], coarse: ["bottom"] },
    submit: null,
    className: "top-auto bottom-0",
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
