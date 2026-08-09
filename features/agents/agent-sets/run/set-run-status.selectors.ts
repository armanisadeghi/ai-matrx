// features/agents/agent-sets/run/set-run-status.selectors.ts
//
// Selectors deriving live member-run status for an orchestrator-set run from
// the activeRequests slice. When an orchestrator runs, each member executes as
// a `sub_agent` operation: the stream's `init` event carries
// `metadata: { label: "custom_tool_N", conversation_id: <child uuid> }` and the
// paired `completion` carries success/failed. The member's real agent_id is NOT
// on the wire — it is resolved from the child conversation row (see
// useSetMemberRunStatus).
//
// Follows the selector rules in active-requests.selectors.ts: factories are
// memoized with createSelector, callers memoize the instance, stable empty refs.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  CompletedOperationEntry,
  OperationEntry,
} from "@/features/agents/types/request.types";

export type SubAgentRunState = "running" | "done" | "failed";

export interface SubAgentOpStatus {
  operationId: string;
  /** The opaque projected tool name (`custom_tool_N`). */
  label: string | null;
  /** The child conversation the member ran under — the agent_id resolution key. */
  childConversationId: string | null;
  status: SubAgentRunState;
}

const EMPTY_OPS: SubAgentOpStatus[] = [];

function toOpStatus(
  op: OperationEntry | CompletedOperationEntry,
  status: SubAgentRunState,
): SubAgentOpStatus {
  const meta = op.metadata ?? null;
  const label = typeof meta?.label === "string" ? meta.label : null;
  const childConversationId =
    typeof meta?.conversation_id === "string" ? meta.conversation_id : null;
  return { operationId: op.operationId, label, childConversationId, status };
}

/** Request statuses that mean "a turn is in flight right now". */
const RUNNING_REQUEST_STATUSES = new Set([
  "pending",
  "connecting",
  "streaming",
  "awaiting-tools",
]);

/**
 * All `sub_agent` operations of the conversation's LATEST request (running +
 * completed). Scoped to the latest request on purpose: each turn is a new
 * requestId, so member statuses naturally reset when a new turn starts.
 *
 * Factory — memoize the instance:
 * `useMemo(() => selectSubAgentOpsForConversation(id), [id])`.
 */
export const selectSubAgentOpsForConversation = (
  conversationId: string | null,
) =>
  createSelector(
    (state: RootState) =>
      conversationId
        ? state.activeRequests.byConversationId[conversationId]
        : undefined,
    (state: RootState) => state.activeRequests.byRequestId,
    (ids, byRequestId): SubAgentOpStatus[] => {
      if (!ids || ids.length === 0) return EMPTY_OPS;
      const request = byRequestId[ids[ids.length - 1]];
      if (!request) return EMPTY_OPS;

      const ops: SubAgentOpStatus[] = [];
      for (const op of Object.values(request.activeOperations)) {
        if (op.operation !== "sub_agent") continue;
        ops.push(toOpStatus(op, "running"));
      }
      for (const op of Object.values(request.completedOperations)) {
        if (op.operation !== "sub_agent") continue;
        ops.push(toOpStatus(op, op.status === "success" ? "done" : "failed"));
      }
      return ops.length > 0 ? ops : EMPTY_OPS;
    },
  );

/** True while the conversation's latest request is still streaming a turn. */
export const selectConversationTurnRunning =
  (conversationId: string | null) =>
  (state: RootState): boolean => {
    if (!conversationId) return false;
    const ids = state.activeRequests.byConversationId[conversationId];
    if (!ids || ids.length === 0) return false;
    const request = state.activeRequests.byRequestId[ids[ids.length - 1]];
    return !!request && RUNNING_REQUEST_STATUSES.has(request.status);
  };
