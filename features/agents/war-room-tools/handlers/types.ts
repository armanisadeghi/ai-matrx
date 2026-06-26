/**
 * Shared types for War Room tool handlers. Mirrors
 * `ui-first-tools/handlers/types.ts`, plus a resolved `threadId` — every war-room
 * tool acts on a specific tile's entities, and the dispatcher resolves that
 * tile from the conversation binding (see `../binding-registry.ts`) BEFORE
 * invoking the handler, so handlers never have to look it up themselves.
 *
 *   (args: TArgs, ctx: WarRoomHandlerContext) => Promise<TResult>
 *
 * Args have already been Zod-validated by the dispatcher AND the user has
 * already approved the write (HITL) by the time `run` is called. Handlers call
 * the REAL feature writers (taskService / tasks thunks / notesApi / war-room
 * service+thunks) so Redux + every open surface update live.
 */

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

export interface WarRoomHandlerContext {
  conversationId: string;
  callId: string;
  userId: string;
  /** The tile whose entities this call may mutate (resolved from the binding). */
  threadId: string;
  dispatch: ThunkDispatch<RootState, unknown, UnknownAction>;
  getState: () => RootState;
}

export interface WarRoomToolHandler<TArgs, TResult> {
  name: string;
  run: (args: TArgs, ctx: WarRoomHandlerContext) => Promise<TResult>;
}

/** Common shape returned by every war-room tool (extends per-tool below). */
export interface WarRoomToolResultBase {
  ok: boolean;
  message?: string;
}
