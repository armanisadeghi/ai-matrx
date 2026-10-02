/**
 * createSurfaceToolCall — what the delegation seam knows about ONE agent tool
 * call, in the shape the surface runtimes take (`SurfaceToolCall`).
 *
 * Both surface dispatchers build it here, once:
 *  - `dispatchSurfaceWrite` spreads `agentWrite` into `applySurfaceWrite` for
 *    the agent's own `apply_surface_write`;
 *  - `dispatchSurfaceClientTool` hands it to the tool's handler, so a tool
 *    that writes on the agent's behalf (the board's `board_item_act`) does so
 *    with `origin: "agent"`, the agent's name and THIS call's inline approval
 *    card — never a second approval path.
 */

import type { ThunkDispatch } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { SurfaceToolCall } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { resolveAgentName } from "@/features/surfaces/hooks/useAgentNames";
import { requestInlineApproval } from "@/features/agents/ui-first-tools/redux/request-approval";
import { buildSurfaceWriteApprovalChange } from "./surface-write-approval-change";

type Dispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

export async function createSurfaceToolCall({
  conversationId,
  callId,
  toolName,
  dispatch,
  getState,
}: {
  conversationId: string;
  callId: string;
  toolName: string;
  dispatch: Dispatch;
  getState: () => RootState;
}): Promise<SurfaceToolCall> {
  const state = getState();
  const agentId = state.conversations.byConversationId[conversationId]?.agentId;
  // Resolve through the SAME module-cached lookup the header uses
  // (useAgentNames) so this never opens a second fetch path; fall back to the
  // agent-definition slice, which may already be hydrated.
  const actorLabel = agentId
    ? ((await resolveAgentName(agentId)) ?? selectAgentById(state, agentId)?.name)
    : undefined;

  // Whether the person pressed Approve on a card for THIS call — so a handler
  // failure after approval tells the model the person agreed and the page
  // still could not apply it (not "the user was never asked").
  let approved = false;

  return {
    conversationId,
    callId,
    toolName,
    approvedByUser: () => approved,
    agentWrite: {
      origin: "agent",
      actorLabel,
      // Provenance for the platform `surface_feedback` target's row.
      conversationId,
      ...(agentId ? { agentId } : {}),
      requestApproval: async (proposal) => {
        // THE CARD IS BUILT BY THE SHARED PRIMITIVE, never inline here: a
        // structured value travels as DATA and is rendered by the kind
        // pipeline. Read `surface-write-approval-change.ts`.
        const change = buildSurfaceWriteApprovalChange(proposal);
        const decision = await requestInlineApproval({
          conversationId,
          callId,
          toolName,
          change,
          dispatch,
        });
        if (decision.kind === "approved") {
          approved = true;
          return { kind: "approved" };
        }
        if (decision.kind === "instructions") {
          return { kind: "declined", instructions: decision.text };
        }
        return decision.kind === "rejected" ? { kind: "declined" } : { kind: "cancelled" };
      },
    },
  };
}
