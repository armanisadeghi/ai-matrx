import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SandboxOperationReceipt } from "@/lib/durable-run/sandbox-operation-receipt";

export type SandboxLifecycleView = { operation_id: string; state: "pending" | "success" | "failure" | "attention" | "unknown" | "refused"; message: string; sandboxId: string | null; action: "check" | "retry" | "recover" | null; dismissed: boolean; restored?: boolean };
export type SandboxLifecycleReservation = Pick<SandboxOperationReceipt, "row_id" | "operation_id" | "kind">;
export type SandboxLifecycleCacheState = { actorId: string | null; generation: number; receipts: SandboxOperationReceipt[]; views: SandboxLifecycleView[]; reservations: SandboxLifecycleReservation[] };
const initialState: SandboxLifecycleCacheState = { actorId: null, generation: 0, receipts: [], views: [], reservations: [] };
const slice = createSlice({ name: "sandboxLifecycle", initialState, reducers: {
  hydrateActor: (state, action: PayloadAction<{ actorId: string; receipts: SandboxOperationReceipt[] }>) => ({ actorId: action.payload.actorId, generation: state.generation + 1, receipts: action.payload.receipts, views: action.payload.receipts.map((receipt) => ({ operation_id: receipt.operation_id, state: "pending" as const, message: "Checking sandbox operation status.", sandboxId: null, action: "check" as const, dismissed: false, restored: true })), reservations: action.payload.receipts.map(({ row_id, operation_id, kind }) => ({ row_id, operation_id, kind })) }),
  clearActor: (state) => ({ actorId: null, generation: state.generation + 1, receipts: [], views: [], reservations: [] }),
  reserveTarget: (state, action: PayloadAction<{ actorId: string; generation: number; reservation: SandboxLifecycleReservation }>) => {
    if (state.actorId !== action.payload.actorId || state.generation !== action.payload.generation) return;
    if (!state.reservations.some((reservation) => reservation.row_id === action.payload.reservation.row_id)) state.reservations.push(action.payload.reservation);
  },
  releaseTarget: (state, action: PayloadAction<{ actorId: string; generation: number; rowId: string; operationId?: string }>) => {
    if (state.actorId !== action.payload.actorId || state.generation !== action.payload.generation) return;
    state.reservations = state.reservations.filter((reservation) => reservation.row_id !== action.payload.rowId || (action.payload.operationId !== undefined && reservation.operation_id !== action.payload.operationId));
  },
  upsertReceipt: (state, action: PayloadAction<SandboxOperationReceipt>) => { const index = state.receipts.findIndex((receipt) => receipt.operation_id === action.payload.operation_id); if (index >= 0) state.receipts[index] = action.payload; else state.receipts.push(action.payload); },
  applyView: (state, action: PayloadAction<{ actorId: string; generation: number; view: SandboxLifecycleView }>) => { if (state.actorId !== action.payload.actorId || state.generation !== action.payload.generation) return; const index = state.views.findIndex((view) => view.operation_id === action.payload.view.operation_id); if (index >= 0) state.views[index] = { ...action.payload.view, dismissed: state.views[index].dismissed || action.payload.view.dismissed, restored: false }; else state.views.push({ ...action.payload.view, restored: false }); if (action.payload.view.state === "success" || action.payload.view.state === "failure" || action.payload.view.state === "refused") { const receipt = state.receipts.find((candidate) => candidate.operation_id === action.payload.view.operation_id); if (receipt) state.reservations = state.reservations.filter((reservation) => reservation.row_id !== receipt.row_id || reservation.operation_id !== receipt.operation_id); } },
  dismissView: (state, action: PayloadAction<{ actorId: string; generation: number; operationId: string }>) => { if (state.actorId !== action.payload.actorId || state.generation !== action.payload.generation) return; const view = state.views.find((candidate) => candidate.operation_id === action.payload.operationId); if (view) view.dismissed = true; },
} });
export const { hydrateActor, clearActor, reserveTarget, releaseTarget, upsertReceipt, applyView, dismissView } = slice.actions;
export default slice.reducer;
