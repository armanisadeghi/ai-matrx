/**
 * dispatchUiFirstTool — parallels `dispatchWidgetAction`, but routes
 * `tool_delegated` events for any of the seven UI-first tools to its
 * registry-bound handler.
 *
 * Flow on every `tool_delegated` event with a ui-first tool_name:
 *   1. Look up the schema + handler from the registry.
 *   2. Validate args via Zod. On schema failure: POST tool_result error,
 *      mark lifecycle 'error'; do NOT throw.
 *   3. Flip the instance to `paused` — this is the honest signal that the
 *      agent is waiting on a client-tool answer. The backend hard-suspended
 *      and ended the stream; the /tool_results POST → resumeInstance handoff
 *      will flip it back to `running` once the user answers.
 *   4. Run the handler. On throw: POST tool_result error + mark lifecycle.
 *   5. On success: POST tool_result with the handler's return value as
 *      `output`. Mark lifecycle 'completed'.
 *
 * The handler may take an arbitrary amount of time (the `user` tool waits
 * on the user clicking a button). The stream will not resume until the
 * tool_result POST lands and `continuation_needed` triggers a fresh /resume
 * stream — see features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { setInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { upsertToolLifecycle } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { getUiFirstToolEntry } from "../tools/registry";

export interface DispatchUiFirstToolPayload {
  conversationId: string;
  requestId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export const dispatchUiFirstTool = createAsyncThunk<
  void,
  DispatchUiFirstToolPayload,
  { state: RootState }
>(
  "uiFirstTools/dispatch",
  async (
    { conversationId, requestId, callId, toolName, args },
    { dispatch, getState },
  ) => {
    const state = getState();
    const userId = state.userAuth?.id ?? null;
    if (!userId) {
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: true,
          output: { ok: false, reason: "unauthenticated" },
          error_message: "user not authenticated",
        }),
      );
      return;
    }

    const entry = getUiFirstToolEntry(toolName);
    if (!entry) {
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: true,
          output: { ok: false, reason: "unknown_tool" },
          error_message: `Unknown ui-first tool: ${toolName}`,
        }),
      );
      return;
    }

    const parsed = entry.schema.safeParse(args);
    if (!parsed.success) {
      const message = `args failed schema for ${toolName}: ${JSON.stringify(
        parsed.error.format(),
      )}`;
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "error",
          isDelegated: true,
          errorType: "schema",
          errorMessage: message,
          result: { ok: false, reason: "schema", message },
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: true,
          output: { ok: false, reason: "schema", message },
          error_message: message,
        }),
      );
      return;
    }

    // Truthful "waiting on the user" status. Set BEFORE awaiting the handler
    // so the instance reflects reality the moment the dispatcher takes over.
    // For fast handlers this is briefly `paused` → `running` (resume sets
    // running) — a single tick of flicker — which beats lying about state.
    dispatch(setInstanceStatus({ conversationId, status: "paused" }));

    try {
      const result = await entry.handler.run(parsed.data, {
        conversationId,
        callId,
        userId,
        dispatch,
        getState,
      });
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "completed",
          isDelegated: true,
          result: result as Record<string, unknown>,
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: false,
          output: result as Record<string, unknown>,
        }),
      );
    } catch (cause) {
      const message = extractErrorMessage(cause);
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "error",
          isDelegated: true,
          errorType: "handler_threw",
          errorMessage: message,
          result: { ok: false, reason: "handler_threw", message },
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: true,
          output: { ok: false, reason: "handler_threw", message },
          error_message: message,
        }),
      );
    }
  },
);
