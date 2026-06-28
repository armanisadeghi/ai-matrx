/** @deprecated Legacy applet broker slice — no-op reducer for compile compatibility. */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { BrokerMapEntry } from "./types";

export interface BrokerState {
  brokers: Record<string, unknown>;
  brokerMap: Record<string, BrokerMapEntry>;
  isLoading: boolean;
  error: string | null;
}

const initialState: BrokerState = {
  brokers: {},
  brokerMap: {},
  isLoading: false,
  error: null,
};

const brokerSlice = createSlice({
  name: "broker",
  initialState,
  reducers: {
    setValue: (state, _action: PayloadAction<{ brokerId: string; value: unknown }>) => state,
    setText: (state, _action: PayloadAction<{ brokerId: string; value: string }>) => state,
    setNumber: (state, _action: PayloadAction<{ brokerId: string; value: number }>) => state,
    setOptions: (state, _action: PayloadAction<unknown>) => state,
    updateOption: (state, _action: PayloadAction<unknown>) => state,
    updateOptionSelectionState: (state, _action: PayloadAction<unknown>) => state,
    setTable: (state, _action: PayloadAction<unknown>) => state,
    updateCell: (state, _action: PayloadAction<unknown>) => state,
    addRow: (state, _action: PayloadAction<unknown>) => state,
    removeRow: (state, _action: PayloadAction<unknown>) => state,
    addColumn: (state, _action: PayloadAction<unknown>) => state,
    removeColumn: (state, _action: PayloadAction<unknown>) => state,
    updateColumn: (state, _action: PayloadAction<unknown>) => state,
    updateRowOrder: (state, _action: PayloadAction<unknown>) => state,
    updateColumnOrder: (state, _action: PayloadAction<unknown>) => state,
    addOrUpdateRegisterEntries: (state, _action: PayloadAction<BrokerMapEntry[]>) => state,
    setLoading: (state, _action: PayloadAction<boolean>) => {
      state.isLoading = _action.payload;
    },
    setError: (state, _action: PayloadAction<string | null>) => {
      state.error = _action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const brokerActions = brokerSlice.actions;
export default brokerSlice.reducer;
