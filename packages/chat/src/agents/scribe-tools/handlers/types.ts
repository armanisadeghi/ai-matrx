/**
 * Shared types for Scribe tool handlers. Parallel to
 * `war-room-master-tools/handlers/types.ts`. Args are already Zod-validated by
 * the dispatcher; the handler resolves its own target (the bound studio session)
 * from Redux state and runs immediately (notify-and-play, no HITL pause).
 */

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

export interface ScribeToolHandlerContext {
  /** The conversation that issued the tool call (used to resolve the session). */
  conversationId: string;
  callId: string;
  userId: string;
  dispatch: ThunkDispatch<RootState, unknown, UnknownAction>;
  getState: () => RootState;
}

export interface ScribeToolHandler<TArgs, TResult> {
  name: string;
  run: (args: TArgs, ctx: ScribeToolHandlerContext) => Promise<TResult>;
}

/** Common shape returned by every scribe tool. */
export interface ScribeToolResultBase {
  ok: boolean;
  message?: string;
}
