/**
 * Shared types for ui-first tool handlers. Each handler matches:
 *
 *   (args: TArgs, ctx: HandlerContext) => Promise<TResult>
 *
 * The args have already been Zod-validated by the dispatcher; the handler
 * trusts the shape but should still defend against missing optional fields
 * per its action discriminator.
 */

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

export interface HandlerContext {
  conversationId: string;
  callId: string;
  userId: string;
  dispatch: ThunkDispatch<RootState, unknown, UnknownAction>;
  getState: () => RootState;
}

export interface ToolHandler<TArgs, TResult> {
  name: string;
  run: (args: TArgs, ctx: HandlerContext) => Promise<TResult>;
}
