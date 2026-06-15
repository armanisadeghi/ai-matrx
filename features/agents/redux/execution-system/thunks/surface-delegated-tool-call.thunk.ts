/**
 * surfaceDelegatedToolCall — the ONE canonical path for turning a
 * client-delegated tool call into UI + execution.
 *
 * Both entry points use it, so there is zero drift between them:
 *   1. LIVE — `process-stream.ts` calls it the instant a `tool_delegated`
 *      stream event arrives.
 *   2. COLD-RESUME — `surface-cold-pending-calls.thunk.ts` calls it on
 *      conversation load for every `cx_tool_call` row the server still has in
 *      `status='delegated'` (the user closed the tab mid-prompt and came back;
 *      see features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md).
 *
 * It adds the pending-call + lifecycle bookkeeping, then routes to the right
 * executor:
 *   - widget_* tools  → `dispatchWidgetAction` (fire-and-forget; the widget
 *     handle resolves or posts not_found).
 *   - ui-first tools  → `dispatchUiFirstTool` (validates, runs the handler —
 *     which may await the user — then POSTs the result).
 *   - anything else   → flip the instance to `paused` and POST an
 *     `unsupported_client_tool` error so the hard-suspended loop never wedges.
 *
 * `data` is the `tool_delegated` event's `data` object (`{ arguments: {...} }`).
 * Cold-resume reconstructs that exact shape from the persisted
 * `cx_tool_call.arguments` so the stored/dispatched shape is identical to live.
 */

import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";

import {
  addPendingToolCall,
  upsertToolLifecycle,
} from "../active-requests/active-requests.slice";
import { setInstanceStatus } from "../conversations/conversations.slice";
import {
  isWidgetActionName,
  type WidgetActionName,
} from "@/features/agents/types/widget-handle.types";
import { dispatchWidgetAction } from "./dispatch-widget-action.thunk";
import { isUiFirstToolName } from "@/features/agents/ui-first-tools/tools/names";
import { dispatchUiFirstTool } from "@/features/agents/ui-first-tools/dispatcher/dispatch-ui-first-tool.thunk";
import { isWarRoomToolName } from "@/features/agents/war-room-tools/tools/names";
import { dispatchWarRoomTool } from "@/features/agents/war-room-tools/dispatcher/dispatch-war-room-tool.thunk";

export interface SurfaceDelegatedToolCallArgs {
  conversationId: string;
  /**
   * The owning request. Live: the active stream's requestId. Cold-resume: the
   * persisted `user_request_id` (the suspended turn that /resume will continue).
   * Used only for lifecycle bookkeeping — the answer + resume path key off
   * conversationId / call_id.
   */
  requestId: string;
  callId: string;
  toolName: string;
  /** The `tool_delegated` event `data` (`{ arguments: {...} }`). */
  data: Record<string, unknown>;
  /**
   * The raw `tool_delegated` event, appended verbatim to the lifecycle entry's
   * `events[]` log. The LIVE path passes it; cold-resume has no live event and
   * omits it (the entry's event log simply starts empty).
   */
  event?: ToolEventPayload;
}

export const surfaceDelegatedToolCall = (
  args: SurfaceDelegatedToolCallArgs,
): ThunkAction<void, RootState, unknown, UnknownAction> => {
  return (dispatch) => {
    const { conversationId, requestId, callId, toolName, data, event } = args;

    dispatch(
      addPendingToolCall({
        requestId,
        toolCall: { callId, toolName, arguments: data ?? {} },
      }),
    );
    dispatch(
      upsertToolLifecycle({
        requestId,
        callId,
        toolName,
        status: "started",
        arguments: data ?? {},
        isDelegated: true,
        ...(event ? { event } : {}),
      }),
    );

    if (isWidgetActionName(toolName)) {
      // Widget actions resolve fast and fire-and-forget — the microtask
      // batcher posts results back so the server can resume.
      dispatch(
        dispatchWidgetAction({
          conversationId,
          requestId,
          callId,
          toolName: toolName as WidgetActionName,
          args: (data?.arguments as Record<string, unknown>) ?? {},
        }),
      );
      return;
    }

    if (isUiFirstToolName(toolName)) {
      // UI-first tools (user / update_plan / tasks / user_todos /
      // request_user_takeover / memory / storage). The dispatcher validates
      // args, runs the handler (which may await user input), and POSTs the
      // result; it flips the instance to `paused` while waiting.
      dispatch(
        dispatchUiFirstTool({
          conversationId,
          requestId,
          callId,
          toolName,
          args: (data?.arguments as Record<string, unknown>) ?? {},
        }),
      );
      return;
    }

    if (isWarRoomToolName(toolName)) {
      // War Room write tools (war_room_update_task / _add_subtask /
      // _toggle_subtask / _update_note / _update_tile). Armed ONLY on a war-room
      // tile's Agent conversation (TileAgentPanel registers them per-conversation
      // + binds the tile). The dispatcher resolves the bound tile, requires the
      // user to approve the write (HITL), runs the real feature writer, then
      // POSTs the result; it flips the instance to `paused` while awaiting
      // approval — same suspend/resume contract as the ui-first tools.
      dispatch(
        dispatchWarRoomTool({
          conversationId,
          requestId,
          callId,
          toolName,
          args: (data?.arguments as Record<string, unknown>) ?? {},
        }),
      );
      return;
    }

    // Unknown delegated tool — neither a widget nor a ui-first tool. The
    // backend hard-suspended the loop awaiting a result; sitting on `paused`
    // would silently wedge it. Flip to `paused` for a truthful state during the
    // microtask window, then POST an error result through the funnel so the
    // server can recover or surface the failure.
    dispatch(setInstanceStatus({ conversationId, status: "paused" }));
    dispatch(
      upsertToolLifecycle({
        requestId,
        callId,
        toolName,
        status: "error",
        isDelegated: true,
        errorType: "unsupported_client_tool",
        errorMessage: `Client has no handler for tool '${toolName}'.`,
      }),
    );
    void import("@/features/agents/api/submit-tool-results").then(
      ({ submitToolResult }) => {
        dispatch(
          submitToolResult({
            conversationId,
            call_id: callId,
            tool_name: toolName,
            is_error: true,
            output: {
              ok: false,
              reason: "unsupported_client_tool",
              message: `Client has no handler for tool '${toolName}'.`,
            },
            error_message: `Client has no handler for tool '${toolName}'.`,
          }),
        );
      },
    );
  };
};
