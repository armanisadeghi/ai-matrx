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
 *
 * Every outcome POSTs to /tool_results so the server can resume the loop.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { callbackManager } from "@/utils/callbackManager";
import { extractErrorMessage } from "@/utils/errors";
import {
  WIDGET_TOOL_NAME_TO_HANDLE_METHOD,
  type WidgetActionName,
  type WidgetActionResult,
  type WidgetHandle,
} from "@/features/agents/types/widget-handle.types";
import { selectWidgetHandleIdFor } from "../instance-ui-state/instance-ui-state.selectors";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { upsertToolLifecycle } from "../active-requests/active-requests.slice";

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
  { state: RootState }
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
