// lib/redux/slices/diffCompareSlice.ts
//
// Tiny global slice backing the "pick two and compare" flow used by the
// canonical diff system (components/diff). The user pins one piece of
// content as the comparison BASE from any surface, then later triggers
// "Compare with base" from another surface — the two are diffed in a
// DiffViewer window.
//
// Deliberately minimal: a single pinned base. This is ephemeral UX state,
// not persisted.

import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { RootState } from "@/lib/redux/store";

export interface DiffCompareBase {
  content: string;
  label: string;
  language: string | null;
}

interface DiffCompareState {
  base: DiffCompareBase | null;
  /** Bumped on every pin so consumers can react if needed. */
  pinnedAt: number | null;
}

const initialState: DiffCompareState = {
  base: null,
  pinnedAt: null,
};

const diffCompareSlice = createSlice({
  name: "diffCompare",
  initialState,
  reducers: {
    setCompareBase(state, action: PayloadAction<DiffCompareBase>) {
      state.base = action.payload;
      state.pinnedAt = Date.now();
    },
    clearCompareBase(state) {
      state.base = null;
      state.pinnedAt = null;
    },
  },
});

export const { setCompareBase, clearCompareBase } = diffCompareSlice.actions;

export const selectCompareBase = (s: RootState): DiffCompareBase | null =>
  s.diffCompare.base;
export const selectHasCompareBase = (s: RootState): boolean =>
  s.diffCompare.base !== null;

/**
 * Open a DiffViewer window comparing the pinned base (left) against the
 * supplied current content (right). Returns false (and pins nothing) when
 * no base is set, so callers can surface a hint.
 */
export const openCompareWithBase = createAsyncThunk<
  boolean,
  { current: string; currentLabel?: string; language?: string | null },
  { state: RootState }
>("diffCompare/openCompareWithBase", (args, { getState, dispatch }) => {
  const base = selectCompareBase(getState());
  if (!base) return false;

  const instanceId = `diffViewerWindow-${Date.now()}`;
  dispatch(
    openOverlay({
      overlayId: "diffViewerWindow",
      instanceId,
      data: {
        windowInstanceId: instanceId,
        original: base.content,
        modified: args.current,
        originalLabel: base.label,
        modifiedLabel: args.currentLabel ?? "Current",
        title: "Compare with base",
        engine: "auto",
        language: args.language ?? base.language ?? null,
        defaultView: "split",
      },
    }),
  );
  return true;
});

export default diffCompareSlice.reducer;
