import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";

export type SandboxLifecycleView = { operation_id: string; state: "pending" | "success" | "failure" | "attention" | "unknown" | "refused"; message: string; sandboxId: string | null; action: "check" | "retry" | "recover"; dismissed: boolean };
export type SandboxLifecycleCacheState = { actorId: string | null; generation: number; receipts: SandboxOperationReceipt[]; views: SandboxLifecycleView[] };
const initialState: SandboxLifecycleCacheState = { actorId: null, generation: 0, receipts: [], views: [] };
const slice = createSlice({ name: "sandboxLifecycle", initialState, reducers: {
  hydrateActor: (state, action: PayloadAction<{ actorId: string; receipts: SandboxOperationReceipt[] }>) => ({ actorId: action.payload.actorId, generation: state.generation + 1, receipts: action.payload.receipts, views: action.payload.receipts.map((receipt) => ({ operation_id: receipt.operation_id, state: "pending" as const, message: "Checking sandbox operation status.", sandboxId: null, action: "check" as const, dismissed: false })) }),
  clearActor: (state) => ({ actorId: null, generation: state.generation + 1, receipts: [], views: [] }),
  upsertReceipt: (state, action: PayloadAction<SandboxOperationReceipt>) => { const index = state.receipts.findIndex((receipt) => receipt.operation_id === action.payload.operation_id); if (index >= 0) state.receipts[index] = action.payload; else state.receipts.push(action.payload); },
  applyView: (state, action: PayloadAction<{ actorId: string; generation: number; view: SandboxLifecycleView }>) => { if (state.actorId !== action.payload.actorId || state.generation !== action.payload.generation) return; const index = state.views.findIndex((view) => view.operation_id === action.payload.view.operation_id); if (index >= 0) state.views[index] = { ...action.payload.view, dismissed: state.views[index].dismissed }; else state.views.push(action.payload.view); },
  dismissView: (state, action: PayloadAction<{ actorId: string; generation: number; operationId: string }>) => { if (state.actorId !== action.payload.actorId || state.generation !== action.payload.generation) return; const view = state.views.find((candidate) => candidate.operation_id === action.payload.operationId); if (view) view.dismissed = true; },
} });
export const { hydrateActor, clearActor, upsertReceipt, applyView, dismissView } = slice.actions;
export default slice.reducer;
