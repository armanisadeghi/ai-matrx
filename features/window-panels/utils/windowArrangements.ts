import type { WindowRect } from "@/features/window-panels/window-panel.types";

/**
 * Calculates a 4-grid quadrant (2x2).
 * @param index 0: top-left, 1: top-right, 2: bottom-left, 3: bottom-right
 */
export function getGrid4Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 2);
  const h = Math.round(vh / 2);
  return {
    x: (index % 2) * w,
    y: Math.floor(index / 2) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates a 6-grid partition (3 columns x 2 rows).
 * @param index 0-5. 0-2 is top row (left-to-right), 3-5 is bottom row.
 */
export function getGrid6Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 3);
  const h = Math.round(vh / 2);
  return {
    x: (index % 3) * w,
    y: Math.floor(index / 3) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates an 8-window grid (4 columns, 2 a rows)
 */
export function getGrid8Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 4);
  const h = Math.round(vh / 2);
  return {
    x: (index % 4) * w,
    y: Math.floor((index % 8) / 4) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates a 9-window grid (3 columns, 3 rows)
 */
export function getGrid9Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 3);
  const h = Math.round(vh / 3);
  return {
    x: (index % 3) * w,
    y: Math.floor((index % 9) / 3) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates a 12-window grid (4 columns, 3 rows)
 */
export function getGrid12Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 4);
  const h = Math.round(vh / 3);
  return {
    x: (index % 4) * w,
    y: Math.floor((index % 12) / 4) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates 2 stacked windows on the right edge.
 * @param index 0: top right half, 1: bottom right half
 */
export function getStackedRight2Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 2);
  const h = Math.round(vh / 2);
  return {
    x: w,
    y: (index % 2) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates 3 stacked windows on the right edge.
 * @param index 0, 1, 2 top-to-bottom on the right third of the screen.
 */
export function getStackedRight3Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 3);
  const h = Math.round(vh / 3);
  return {
    x: vw - w,
    y: (index % 3) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates 4 stacked windows on the right edge.
 * @param index 0,1,2,3 top-to-bottom on the right quarter of the screen.
 */
export function getStackedRight4Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 4);
  const h = Math.round(vh / 4);
  return {
    x: vw - w,
    y: (index % 4) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates 5 stacked windows on the right edge.
 */
export function getStackedRight5Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 5);
  const h = Math.round(vh / 5);
  return {
    x: vw - w,
    y: (index % 5) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates 2 stacked windows on the left edge.
 * @param index 0: top left half, 1: bottom left half
 */
export function getStackedLeft2Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 2);
  const h = Math.round(vh / 2);
  return {
    x: 0,
    y: (index % 2) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates 3 stacked windows on the left edge.
 * @param index 0, 1, 2 top-to-bottom on the left third of the screen.
 */
export function getStackedLeft3Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 3);
  const h = Math.round(vh / 3);
  return {
    x: 0,
    y: (index % 3) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates 4 stacked windows on the left edge.
 * @param index 0,1,2,3 top-to-bottom on the left quarter of the screen.
 */
export function getStackedLeft4Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 4);
  const h = Math.round(vh / 4);
  return {
    x: 0,
    y: (index % 4) * h,
    width: w,
    height: h,
  };
}

/**
 * Calculates 5 stacked windows on the left edge.
 */
export function getStackedLeft5Rect(
  index: number,
  vw: number,
  vh: number,
): WindowRect {
  const w = Math.round(vw / 5);
  const h = Math.round(vh / 5);
  return {
    x: 0,
    y: (index % 5) * h,
    width: w,
    height: h,
  };
}

export type GlobalLayoutType =
  | "grid4"
  | "grid6"
  | "grid8"
  | "grid9"
  | "grid12"
  | "stackRight2"
  | "stackRight3"
  | "stackRight4"
  | "stackRight5"
  | "stackLeft2"
  | "stackLeft3"
  | "stackLeft4"
  | "stackLeft5";

/**
 * Helper: Applies global arrangement to an array of windows logic.
 * Returns an array of updates to batch dispatch.
 */
export function computeGlobalArrangement(
  layout: GlobalLayoutType,
  windowIds: string[],
  vw: number,
  vh: number,
  dirX: "ltr" | "rtl" = "rtl",
  dirY: "ttb" | "btt" = "ttb",
  primary: "horizontal" | "vertical" = "vertical",
): { id: string; rect: WindowRect }[] {
  const specs: Record<
    GlobalLayoutType,
    {
      cols: number;
      rows: number;
      fn: (i: number, w: number, h: number) => WindowRect;
    }
  > = {
    grid4: { cols: 2, rows: 2, fn: getGrid4Rect },
    grid6: { cols: 3, rows: 2, fn: getGrid6Rect },
    grid8: { cols: 4, rows: 2, fn: getGrid8Rect },
    grid9: { cols: 3, rows: 3, fn: getGrid9Rect },
    grid12: { cols: 4, rows: 3, fn: getGrid12Rect },
    stackRight2: { cols: 1, rows: 2, fn: getStackedRight2Rect },
    stackRight3: { cols: 1, rows: 3, fn: getStackedRight3Rect },
    stackRight4: { cols: 1, rows: 4, fn: getStackedRight4Rect },
    stackRight5: { cols: 1, rows: 5, fn: getStackedRight5Rect },
    stackLeft2: { cols: 1, rows: 2, fn: getStackedLeft2Rect },
    stackLeft3: { cols: 1, rows: 3, fn: getStackedLeft3Rect },
    stackLeft4: { cols: 1, rows: 4, fn: getStackedLeft4Rect },
    stackLeft5: { cols: 1, rows: 5, fn: getStackedLeft5Rect },
  };

  const spec = specs[layout];
  // Only fill unique slots — extras used to wrap onto occupied tiles and overlap.
  const slotCount = spec.cols * spec.rows;
  const placed = windowIds.slice(0, slotCount);

  return placed.map((id, i) => {
    let col: number;
    let row: number;

    if (primary === "horizontal") {
      col = i % spec.cols;
      row = Math.floor(i / spec.cols);
    } else {
      row = i % spec.rows;
      col = Math.floor(i / spec.rows);
    }

    if (dirX === "rtl") {
      col = spec.cols - 1 - col;
    }
    if (dirY === "btt") {
      row = spec.rows - 1 - row;
    }

    const targetIndex = row * spec.cols + col;

    return {
      id,
      rect: spec.fn(targetIndex, vw, vh),
    };
  });
}
