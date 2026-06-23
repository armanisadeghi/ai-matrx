/**
 * Human-in-the-loop approval for War Room write tools.
 *
 * Every war-room tool mutates the user's live work, so the dispatcher requires
 * an explicit approval before the handler runs. This enqueues a structured
 * `approval`-kind ask that the dedicated `<ApprovalCard>` renders in the SAME
 * `<PendingAsksZone>` already mounted in the war-room panel's conversation
 * column, and awaits the user's decision via the shared ask-resolver registry:
 *
 *   - `enqueuePendingAsk` (pendingAsks slice) carries the {@link ApprovalChange}
 *     descriptor + the tileId (so the card's "always approve" knows its scope).
 *   - `registerAskResolver` gives us a promise that resolves when the user
 *     clicks Approve / Decline / Respond / × on that card.
 *
 * The card resolves `{confirmed:true}` (Approve — plus the REMEMBER_SENTINEL in
 * `selected` when "always approve" is checked), `{confirmed:false}` (Decline),
 * `{freeform:string}` (Respond — typed instructions instead of approving), or
 * `{cancelled:true}` (×). We map that to a small decision object.
 *
 * Approval asks do NOT carry a timeout: the user may approve seconds or minutes
 * later, exactly like a client-tool answer. The server's far-future abandonment
 * backstop on `cx_tool_call.expires_at` is the only timing source.
 */

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  enqueuePendingAsk,
  resolvePendingAsk,
  sweepPendingAsks,
  selectPendingAsksForConversation,
} from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import { registerAskResolver } from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import { resolveAskByCallId } from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import type { AskUserResponse } from "@/features/agents/ui-first-tools/tools/schemas";
import { EMPTY_ASK_RESPONSE } from "@/features/agents/ui-first-tools/tools/schemas";
import type { ApprovalChange } from "@/features/agents/ui-first-tools/ui/approval-types";
import { REMEMBER_SENTINEL } from "@/features/agents/ui-first-tools/ui/approval-types";

type Dispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

export type WarRoomApprovalDecision =
  | { kind: "approved"; remember: boolean }
  | { kind: "rejected" }
  | { kind: "instructions"; text: string }
  | { kind: "cancelled" };

export interface RequestApprovalInput {
  conversationId: string;
  /** The delegated tool call id — the ApprovalCard keys off this. */
  callId: string;
  /** The tile this change acts on (drives the "always approve" scope). */
  tileId: string;
  /** The structured change descriptor the card renders. */
  change: ApprovalChange;
  dispatch: Dispatch;
}

/**
 * Enqueue an approval card and await the user's decision. Resolves only once —
 * Approve/Decline/Respond/× all route through the shared resolver.
 */
export async function requestWarRoomApproval(
  input: RequestApprovalInput,
): Promise<WarRoomApprovalDecision> {
  const { conversationId, callId, tileId, change, dispatch } = input;

  dispatch(
    enqueuePendingAsk({
      callId,
      conversationId,
      // Namespaced toolName — approval cards route by `kind`, not toolName.
      toolName: "war_room",
      kind: "approval",
      approval: change,
      tileId,
      status: "pending",
      createdAtMs: Date.now(),
    }),
  );

  const response: AskUserResponse = await new Promise<AskUserResponse>(
    (resolve) => {
      registerAskResolver(callId, resolve);
    },
  );

  // Fade + sweep the card (same pattern as the ui-first userHandler).
  dispatch(resolvePendingAsk({ callId, conversationId }));
  queueMicrotask(() => {
    setTimeout(() => dispatch(sweepPendingAsks(conversationId)), 250);
  });

  if (response.cancelled || response.timed_out) return { kind: "cancelled" };
  const freeform = response.freeform?.trim();
  if (freeform) return { kind: "instructions", text: freeform };
  if (response.confirmed === true) {
    const remember = response.selected?.includes(REMEMBER_SENTINEL) ?? false;
    return { kind: "approved", remember };
  }
  // confirmed === false (Decline), or any non-affirmative envelope → rejected.
  return { kind: "rejected" };
}

/**
 * When the user grants "always approve" while several edits are stacked up
 * (e.g. the agent queued three subtask adds in one turn), instantly approve the
 * SIBLING pending approval cards for the same tile + scope so they don't keep
 * asking. Each sibling's awaiting promise unblocks and its handler runs.
 */
export function cascadeAutoApprove(opts: {
  conversationId: string;
  tileId: string;
  scope: string;
  excludeCallId: string;
  getState: () => RootState;
}): void {
  const { conversationId, tileId, scope, excludeCallId, getState } = opts;
  const asks = selectPendingAsksForConversation(conversationId)(getState());
  for (const ask of asks) {
    if (
      ask.status === "pending" &&
      ask.kind === "approval" &&
      ask.callId !== excludeCallId &&
      ask.tileId === tileId &&
      ask.approval?.autoApprove?.scope === scope
    ) {
      resolveAskByCallId(ask.callId, { ...EMPTY_ASK_RESPONSE, confirmed: true });
    }
  }
}
