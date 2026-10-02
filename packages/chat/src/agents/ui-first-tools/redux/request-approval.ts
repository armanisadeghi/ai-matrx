/**
 * Shared promise bridge for inline agent-change approvals.
 *
 * Producers enqueue a structured change, then await the decision rendered by
 * `<ApprovalCard>` in the conversation's `<PendingAsksZone>`. The card may be
 * minimized without resolving this promise; only an explicit user action
 * resumes the delegated tool call.
 */

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  enqueuePendingAsk,
  resolvePendingAsk,
  sweepPendingAsks,
} from "./pending-asks.slice";
import { registerAskResolver } from "./ask-resolver-registry";
import type { AskUserResponse } from "../tools/schemas";
import type { ApprovalChange } from "../ui/approval-types";
import { REMEMBER_SENTINEL } from "../ui/approval-types";

type Dispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

export type ApprovalDecision =
  | { kind: "approved"; remember: boolean }
  | { kind: "rejected" }
  | { kind: "instructions"; text: string }
  | { kind: "cancelled" };

export interface RequestInlineApprovalInput {
  conversationId: string;
  callId: string;
  toolName: string;
  change: ApprovalChange;
  dispatch: Dispatch;
  threadId?: string;
}

/** Enqueue one non-blocking approval card and wait for an explicit decision. */
export async function requestInlineApproval(
  input: RequestInlineApprovalInput,
): Promise<ApprovalDecision> {
  const { conversationId, callId, toolName, change, dispatch, threadId } = input;

  dispatch(
    enqueuePendingAsk({
      callId,
      conversationId,
      toolName,
      kind: "approval",
      approval: change,
      ...(threadId ? { threadId } : {}),
      status: "pending",
      createdAtMs: Date.now(),
    }),
  );

  const response = await new Promise<AskUserResponse>((resolve) => {
    registerAskResolver(callId, resolve);
  });

  dispatch(resolvePendingAsk({ callId, conversationId }));
  queueMicrotask(() => {
    setTimeout(() => dispatch(sweepPendingAsks(conversationId)), 250);
  });

  if (response.cancelled || response.timed_out) return { kind: "cancelled" };
  const freeform = response.freeform?.trim();
  if (freeform) return { kind: "instructions", text: freeform };
  if (response.confirmed === true) {
    return {
      kind: "approved",
      remember: response.selected?.includes(REMEMBER_SENTINEL) ?? false,
    };
  }
  return { kind: "rejected" };
}
