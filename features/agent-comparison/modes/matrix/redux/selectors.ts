/**
 * Matrix-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { isLive, setupProblems } from "../model";
import type { MatrixBattleState } from "../types";

const selectRoot = (state: RootState): MatrixBattleState => state.agentComparisonMatrix;

export const selectMatrixSetup = createSelector([selectRoot], (r) => r.setup);
export const selectMatrixBase = createSelector([selectRoot], (r) => r.setup.base);
export const selectMatrixRows = createSelector([selectRoot], (r) => r.setup.rows);
export const selectMatrixColumns = createSelector([selectRoot], (r) => r.setup.columns);
export const selectMatrixRepeats = createSelector([selectRoot], (r) => r.setup.repeats);
export const selectMatrixSetId = createSelector([selectRoot], (r) => r.activeSetId);
export const selectMatrixSetName = createSelector([selectRoot], (r) => r.activeSetName);
export const selectMatrixDirty = createSelector([selectRoot], (r) => r.dirty);
export const selectMatrixCells = createSelector([selectRoot], (r) => r.cells);
export const selectMatrixRunInFlight = createSelector([selectRoot], (r) => r.runInFlight);
export const selectMatrixRunError = createSelector([selectRoot], (r) => r.runError);
export const selectMatrixReadError = createSelector([selectRoot], (r) => r.readError);

export const selectMatrixProblems = createSelector([selectMatrixSetup], (setup) =>
  setupProblems(setup),
);

export const selectMatrixLiveCount = createSelector(
  [selectMatrixCells],
  (cells) => cells.filter(isLive).length,
);

export const selectMatrixCellCount = createSelector(
  [selectMatrixSetup],
  (s) => s.rows.variants.length * s.columns.variants.length * s.repeats,
);

/** Cells counted by status for the progress line. */
export const selectMatrixProgress = createSelector([selectMatrixCells], (cells) => {
  const out = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0, stalled: 0 };
  for (const c of cells) {
    if (c.stalled) out.stalled += 1;
    else out[c.status] += 1;
  }
  return out;
});
