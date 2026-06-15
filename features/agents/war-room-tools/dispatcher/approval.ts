/**
 * Human-in-the-loop approval for War Room write tools.
 *
 * Every war-room tool mutates the user's live work, so the dispatcher requires
 * an explicit approval click before the handler runs. Rather than invent a new
 * approval surface, this REUSES the ui-first ask infrastructure end to end:
 *
 *   - `enqueuePendingAsk` (pendingAsks slice) renders a `confirm`-kind AskCard
 *     in the SAME `<PendingAsksZone>` already mounted in the war-room panel's
 *     conversation column (ExperimentalAgentScreen → AgentConversationColumn).
 *   - `registerAskResolver` (ask-resolver-registry) gives us a promise that
 *     resolves when the user clicks Yes / No / Other on that card.
 *
 * The card's `confirm` body resolves `{confirmed:true}` (Yes), `{confirmed:false}`
 * (No), `{freeform:string}` (Other — typed instructions instead of approving),
 * or `{cancelled:true}` (the card's Skip × button). We map that to a small
 * decision object the dispatcher acts on.
 *
 * Approval cards do NOT carry a timeout: the user may approve seconds or
 * minutes later, exactly like a client-tool answer. The server's far-future
 * abandonment backstop on `cx_tool_call.expires_at` is the only timing source.
 */

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  enqueuePendingAsk,
  resolvePendingAsk,
  sweepPendingAsks,
} from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import { registerAskResolver } from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import type { AskUserResponse } from "@/features/agents/ui-first-tools/tools/schemas";

type Dispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

export type WarRoomApprovalDecision =
  | { kind: "approved" }
  | { kind: "rejected" }
  | { kind: "instructions"; text: string }
  | { kind: "cancelled" };

export interface RequestApprovalInput {
  conversationId: string;
  /** The delegated tool call id — the AskCard keys off this. */
  callId: string;
  /** Short uppercase chip (≤12 chars), e.g. "TASK" / "NOTE" / "SUBTASK". */
  header: string;
  /** One-line, human-readable summary of the exact change to apply. */
  summary: string;
  dispatch: Dispatch;
}

/**
 * Enqueue a confirm card and await the user's decision. Resolves only once —
 * the AskCard's Yes/No/Other/Skip all route through the shared resolver.
 */
export async function requestWarRoomApproval(
  input: RequestApprovalInput,
): Promise<WarRoomApprovalDecision> {
  const { conversationId, callId, header, summary, dispatch } = input;

  dispatch(
    enqueuePendingAsk({
      callId,
      conversationId,
      // Reuse the `user` toolName so the AskCard offers the "Other…" escape
      // (the card shows extras only for toolName === "user"), letting the user
      // redirect with typed instructions instead of a bare yes/no.
      toolName: "user",
      kind: "confirm",
      header,
      question: summary,
      context: "Agent wants to edit this tile",
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
  if (response.confirmed === true) return { kind: "approved" };
  // confirmed === false (No), or any non-affirmative envelope → rejected.
  return { kind: "rejected" };
}
