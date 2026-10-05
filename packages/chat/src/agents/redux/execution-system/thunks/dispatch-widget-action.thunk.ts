/**
 * dispatchWidgetAction — routes a `tool_delegated` widget_* call to the
 * registered WidgetHandle method and submits the result.
 *
 * Called from `process-stream.ts` the moment a `tool_delegated` event with a
 * widget_* tool_name arrives. Fire-and-forget from the stream's POV — the
 * instance is NOT paused (the microtask batcher posts back quickly enough
 * that the server resumes without the client needing to suspend).
 *
 * Error semantics:
 *   - No handle at all       → { ok:false, reason:"not_found", ... }
 *   - Handle missing method  → { ok:false, reason:"unsupported", ... } + onError
 *   - Method throws          → { ok:false, reason:"failed", ... } + onError
 *   - Method resolves         → { ok:true, applied:toolName }
 *   - Person declined         → is_error false, `personDeclinedToolOutput`
 *
 * WRITE POLICY: every widget_* tool writes into what the person is looking
 * at. Unless the handle declares `applyPolicy: "auto"` (it stages writes for
 * its own review), the write waits on the conversation's inline approval card
 * — the SAME card `apply_surface_write` shows on an `ask` target — and lands
 * only on Approve. 2026-10-05: a "Summarize Content" run on /notes called
 * widget_text_patch and rewrote the note body, never asked.
 *
 * Every outcome POSTs to /tool_results so the server can resume the loop.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ChatRootState } from "../../../../store/root-state";
import { callbackManager } from "@ai-matrx/chat/utils/callbackManager";
import { extractErrorMessage } from "@ai-matrx/data/net";
import {
  WIDGET_TOOL_NAME_TO_HANDLE_METHOD,
  type WidgetActionName,
  type WidgetActionResult,
  type WidgetHandle,
} from "../../../types/widget-handle.types";
import { selectWidgetHandleIdFor } from "../instance-ui-state/instance-ui-state.selectors";
import { submitToolResult } from "../../../api/submit-tool-results";
import { upsertToolLifecycle } from "../active-requests/active-requests.slice";
import { setInstanceStatus } from "../conversations/conversations.slice";
import { requestInlineApproval } from "../../../ui-first-tools/redux/request-approval";
import { personDeclinedToolOutput } from "../../../api/person-declined-tool-output";
import { resolveAgentName } from "../../../../surfaces/hooks/useAgentNames";
import { selectAgentById } from "../../agent-definition/selectors";
import { buildWidgetActionApprovalChange } from "./widget-action-approval-change";

export interface DispatchWidgetActionPayload {
  conversationId: string;
  requestId: string;
  callId: string;
  toolName: WidgetActionName;
  args: Record<string, unknown>;
}

export const dispatchWidgetAction = createAsyncThunk<
  WidgetActionResult,
  DispatchWidgetActionPayload,
  { state: ChatRootState }
>(
  "widgetAction/dispatch",
  async (
    { conversationId, requestId, callId, toolName, args },
    { dispatch, getState },
  ) => {
    const state = getState();
    const handleId = selectWidgetHandleIdFor(state, conversationId);
    const handle = handleId
      ? callbackManager.get<WidgetHandle>(handleId)
      : null;

    // Client-measured execution time, persisted to cx_tool_call.duration_ms —
    // without it every client-delegated call lands as duration_ms=0.
    const startedAt = performance.now();

    let result: WidgetActionResult;

    if (!handle) {
      result = {
        ok: false,
        reason: "not_found",
        message: `No widget handle registered for conversation ${conversationId}`,
      };
    } else {
      // MATRX-EXCEPTION: WidgetHandle is a heterogeneous method registry —
      // each onX method takes a DIFFERENTLY-shaped payload. Dispatch needs one
      // uniform callable signature to invoke whichever method the tool name
      // maps to; the `typeof method !== "function"` check just below is the
      // runtime validation that makes this cast safe.
      const methodKey = WIDGET_TOOL_NAME_TO_HANDLE_METHOD[toolName];
      const method = handle[methodKey] as unknown as
        | ((p: Record<string, unknown>) => void | Promise<void>)
        | undefined;

      if (typeof method !== "function") {
        result = {
          ok: false,
          reason: "unsupported",
          message: `Widget handle does not implement ${methodKey}`,
        };
        handle.onError?.({
          reason: "unsupported",
          message: `Widget handle does not implement ${methodKey}`,
        });
      } else {
        const decision = await askPerson({
          handle,
          conversationId,
          callId,
          toolName,
          args,
          dispatch,
          getState,
        });
        if (decision.kind !== "approved") {
          const output = personDeclinedToolOutput({
            reason: decision.kind === "cancelled" ? "skipped" : "kept_as_is",
            message:
              decision.kind === "cancelled"
                ? "The person closed the approval without deciding. Nothing was changed."
                : "The person kept the text as is. Nothing was changed — do not retry this edit.",
            ...(decision.kind === "instructions"
              ? { instructions: decision.text }
              : {}),
          });
          dispatch(
            upsertToolLifecycle({
              requestId,
              callId,
              toolName,
              status: "completed",
              isDelegated: true,
              result: output,
            }),
          );
          dispatch(
            submitToolResult({
              conversationId,
              call_id: callId,
              tool_name: toolName,
              is_error: false,
              output,
              duration_ms: Math.round(performance.now() - startedAt),
            }),
          );
          return { ok: false, reason: "declined", message: output.message };
        }
        try {
          await method(args);
          result = { ok: true, applied: toolName };
        } catch (cause) {
          const message = extractErrorMessage(cause);
          result = {
            ok: false,
            reason: "failed",
            message,
            cause,
          };
          handle.onError?.({
            reason: "failed",
            message,
            cause,
          });
        }
      }
    }

    // Update the UI's tool-lifecycle state so the transcript reflects the
    // outcome. Matches what the server-driven tool_completed/tool_error
    // branch would dispatch for a non-delegated tool.
    const finalResult: WidgetActionResult = result;
    if (finalResult.ok === true) {
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "completed",
          isDelegated: true,
          result: { ok: true, applied: finalResult.applied },
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: false,
          output: { ok: true, applied: finalResult.applied },
          duration_ms: Math.round(performance.now() - startedAt),
        }),
      );
    } else {
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "error",
          isDelegated: true,
          errorType: finalResult.reason,
          errorMessage: finalResult.message,
          result: {
            ok: false,
            reason: finalResult.reason,
            message: finalResult.message,
          },
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: true,
          output: {
            ok: false,
            reason: finalResult.reason,
            message: finalResult.message,
          },
          error_message: finalResult.message ?? finalResult.reason,
          duration_ms: Math.round(performance.now() - startedAt),
        }),
      );
    }

    return result;
  },
);

type WidgetApprovalDecision =
  | { kind: "approved" }
  | { kind: "rejected" }
  | { kind: "instructions"; text: string }
  | { kind: "cancelled" };

/**
 * The handle's write policy, applied: `auto` → approved without a card;
 * otherwise the inline approval card, and the instance sits `paused` while
 * the person decides (the honest state — same as `dispatchSurfaceWrite`).
 */
async function askPerson({
  handle,
  conversationId,
  callId,
  toolName,
  args,
  dispatch,
  getState,
}: {
  handle: WidgetHandle;
  conversationId: string;
  callId: string;
  toolName: WidgetActionName;
  args: Record<string, unknown>;
  dispatch: Parameters<typeof requestInlineApproval>[0]["dispatch"];
  getState: () => ChatRootState;
}): Promise<WidgetApprovalDecision> {
  if (handle.applyPolicy === "auto") return { kind: "approved" };
  const state = getState();
  const agentId = state.conversations.byConversationId[conversationId]?.agentId;
  const actorLabel = agentId
    ? ((await resolveAgentName(agentId)) ?? selectAgentById(state, agentId)?.name)
    : undefined;
  let currentText: string | null = null;
  try {
    currentText = handle.readText?.() ?? null;
  } catch {
    currentText = null;
  }
  const change = buildWidgetActionApprovalChange({
    toolName,
    args,
    ...(actorLabel ? { actorLabel } : {}),
    currentText,
  });
  // The tool-result POST resumes the loop (and flips the status back).
  dispatch(setInstanceStatus({ conversationId, status: "paused" }));
  const decision = await requestInlineApproval({
    conversationId,
    callId,
    toolName,
    change,
    dispatch,
  });
  return decision.kind === "approved" ? { kind: "approved" } : decision;
}
