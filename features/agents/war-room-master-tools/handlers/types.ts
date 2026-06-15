/**
 * Shared types for War Room MASTER tool handlers. Parallel to
 * `war-room-tools/handlers/types.ts`, but the master tools act ACROSS rooms, so
 * there is no single bound tile resolved up-front — each handler resolves its
 * own target (a thread via `resolveThread`, a room by id) from its validated
 * args.
 *
 *   (args: TArgs, ctx: WarRoomMasterHandlerContext) => Promise<TResult>
 *
 * Args have already been Zod-validated by the dispatcher. The master's actions
 * are NOTIFY-AND-WATCH (no HITL pause) — read / create / rename / message all
 * run immediately. Handlers call the REAL primitives (createManualInstance,
 * forkConversationServer, executeInstance, war-room thunks) so Redux + every
 * open surface update live; the messaging handler also opens a watch window +
 * fires a toast so the user sees the run in real time.
 */

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

export interface WarRoomMasterHandlerContext {
  /** The MASTER conversation that issued the tool call (for logging/scoping). */
  conversationId: string;
  callId: string;
  userId: string;
  dispatch: ThunkDispatch<RootState, unknown, UnknownAction>;
  getState: () => RootState;
}

export interface WarRoomMasterToolHandler<TArgs, TResult> {
  name: string;
  run: (args: TArgs, ctx: WarRoomMasterHandlerContext) => Promise<TResult>;
}

/** Common shape returned by every master tool (extended per-tool in schemas). */
export interface WarRoomMasterToolResultBase {
  ok: boolean;
  message?: string;
}
