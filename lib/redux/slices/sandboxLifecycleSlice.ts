import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";

export type SandboxLifecycleCacheState = { actorId: string | null; generation: number; receipts: SandboxOperationReceipt[] };
const initialState: SandboxLifecycleCacheState = { actorId: null, generation: 0, receipts: [] };
const slice = createSlice({ name: "sandboxLifecycle", initialState, reducers: {
  hydrateActor: (state, action: PayloadAction<{ actorId: string; receipts: SandboxOperationReceipt[] }>) => ({ actorId: action.payload.actorId, generation: state.generation + 1, receipts: action.payload.receipts }),
  clearActor: (state) => ({ actorId: null, generation: state.generation + 1, receipts: [] }),
  upsertReceipt: (state, action: PayloadAction<SandboxOperationReceipt>) => { const index = state.receipts.findIndex((receipt) => receipt.operation_id === action.payload.operation_id); if (index >= 0) state.receipts[index] = action.payload; else state.receipts.push(action.payload); },
} });
export const { hydrateActor, clearActor, upsertReceipt } = slice.actions;
export default slice.reducer;
