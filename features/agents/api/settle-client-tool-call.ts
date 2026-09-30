/**
 * settleClientToolCall — the ONE place a client-answered tool call becomes
 * "done" on this client.
 *
 * ## The defect this exists to prevent (2026-09-30)
 *
 * The client answers a delegated tool (`apply_surface_write`, `user`, a
 * widget action …) by POSTing the result. The SERVER learns it is done from
 * that POST — but the CLIENT'S OWN stores only learn from server events, and
 * for a delegated call the server never sends one: it already ended the stream
 * when it hard-suspended. So the chat card stayed "Working…" forever after the
 * agent had visibly moved on.
 *
 * Two stores hold a tool call, and both were stale:
 *  - `activeRequests.toolLifecycle` — live; each dispatcher hand-rolled an
 *    `upsertToolLifecycle` beside its submit (and a dispatcher that forgot
 *    left a permanent spinner);
 *  - `observability.toolCalls` — what every committed/persisted card reads.
 *    The end-of-stream flush snapshots it while the call is still `started`;
 *    nothing ever updated it once the client answered, so the settled message
 *    kept rendering a spinner. No dispatcher touched it.
 *
 * ## The rule
 *
 * The client that answers a call is the first to know it is finished, so it
 * tells ITSELF at the same moment it tells the server — inside the single
 * `submitToolResult` funnel, never per dispatcher. A dispatcher that calls
 * `submitToolResult` gets correct cards for free.
 *
 * Idempotent: a call already terminal is left alone, so a dispatcher that still
 * upserts its own richer entry (error type, delegated flag) is never clobbered.
 */

import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { upsertToolLifecycle } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import {
  patchToolCall,
  type CxToolCallRecord,
} from "@/features/agents/redux/execution-system/observability/observability.slice";

export interface SettledToolAnswer {
  conversationId: string;
  call_id: string;
  tool_name: string;
  is_error?: boolean | null;
  output?: unknown;
  error_message?: string | null;
  duration_ms?: number | null;
}

function serializeOutput(output: unknown): string | null {
  if (output === undefined || output === null) return null;
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output);
  } catch {
    return null;
  }
}

export const settleClientToolCall = (
  answer: SettledToolAnswer,
): ThunkAction<void, RootState, unknown, UnknownAction> => {
  return (dispatch, getState) => {
    const { conversationId, call_id: callId } = answer;
    const isError = Boolean(answer.is_error);
    const errorMessage = answer.error_message ?? null;
    const state = getState();

    // Live store: every request of this conversation that carries the call
    // (the original stream AND any resumed one).
    const requests = state.activeRequests?.byRequestId ?? {};
    for (const [requestId, request] of Object.entries(requests)) {
      if (request.conversationId !== conversationId) continue;
      const entry = request.toolLifecycle?.[callId];
      if (!entry || entry.status === "completed" || entry.status === "error") {
        continue;
      }
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName: answer.tool_name,
          status: isError ? "error" : "completed",
          isDelegated: true,
          ...(answer.output !== undefined ? { result: answer.output } : {}),
          ...(isError
            ? {
                errorType: "client_tool_error",
                errorMessage: errorMessage ?? "The tool reported an error.",
              }
            : {}),
        }),
      );
    }

    // Persisted store: the row every settled card is drawn from.
    const output = serializeOutput(answer.output);
    const completedAt = new Date().toISOString();
    const records: Record<string, CxToolCallRecord> =
      state.observability?.toolCalls ?? {};
    for (const record of Object.values(records)) {
      if (record.conversationId !== conversationId || record.callId !== callId) {
        continue;
      }
      if (record.status === "completed" || record.status === "failed") continue;
      dispatch(
        patchToolCall({
          id: record.id,
          patch: {
            status: isError ? "failed" : "completed",
            success: !isError,
            isError: isError ? true : null,
            errorMessage: isError ? errorMessage : null,
            output,
            outputChars: output?.length ?? 0,
            completedAt,
            ...(answer.duration_ms != null
              ? { durationMs: answer.duration_ms }
              : {}),
          },
        }),
      );
    }
  };
};
