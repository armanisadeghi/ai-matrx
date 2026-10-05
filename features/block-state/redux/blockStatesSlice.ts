// features/block-state/redux/blockStatesSlice.ts
//
// The normalized block-state entity: every row the person can see, keyed by its
// unique tuple, plus which hydration units are loaded and which writes failed.
// Fed by ONE batched read per conversation and the realtime feed; written
// optimistically by nothing here (the hook holds the unflushed overlay).

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { rowKeyOf, type BlockStateRow, type BlockStateSaveError } from "../types";

export type HydrationStatus = "loading" | "loaded" | "error";

export interface BlockStatesState {
  rows: Record<string, BlockStateRow>;
  hydration: Record<string, HydrationStatus>;
  errors: Record<string, BlockStateSaveError>;
}

const initialState: BlockStatesState = { rows: {}, hydration: {}, errors: {} };

const slice = createSlice({
  name: "blockStates",
  initialState,
  reducers: {
    /** ONE dispatch for a whole page of rows. A row older than the one held is dropped. */
    upsertBlockStateRows(state, action: PayloadAction<BlockStateRow[]>) {
      for (const row of action.payload) {
        const key = rowKeyOf(row);
        const held = state.rows[key];
        if (row.deleted_at) {
          delete state.rows[key];
          continue;
        }
        if (held && held.id === row.id && row.version < held.version) continue;
        state.rows[key] = row;
      }
    },
    setBlockStateHydration(state, action: PayloadAction<{ unit: string; status: HydrationStatus }>) {
      state.hydration[action.payload.unit] = action.payload.status;
    },
    setBlockStateSaveError(state, action: PayloadAction<{ rowKey: string; error: BlockStateSaveError | null }>) {
      if (action.payload.error) state.errors[action.payload.rowKey] = action.payload.error;
      else delete state.errors[action.payload.rowKey];
    },
  },
});

export const { upsertBlockStateRows, setBlockStateHydration, setBlockStateSaveError } = slice.actions;
export const blockStatesReducer = slice.reducer;

type WithSlice = { blockStates: BlockStatesState };

export const selectBlockStateRow = (state: WithSlice, rowKey: string): BlockStateRow | undefined =>
  state.blockStates.rows[rowKey];
export const selectBlockStateHydration = (state: WithSlice, unit: string | null): HydrationStatus | undefined =>
  unit ? state.blockStates.hydration[unit] : undefined;
export const selectBlockStateError = (state: WithSlice, rowKey: string | null): BlockStateSaveError | undefined =>
  rowKey ? state.blockStates.errors[rowKey] : undefined;
export const selectAllBlockStateRows = (state: WithSlice): Record<string, BlockStateRow> => state.blockStates.rows;
