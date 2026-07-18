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
 *   - desktop tools (`local_*`, matrx-local executor) → NOT ours to answer.
 *     While a desktop is online we leave the ledger row in `delegated` — the
 *     matrx-local engine polls `GET /ai/user/pending_calls`, executes, POSTs
 *     the result, and resumes the loop itself (its FEATURE.md invariant:
 *     "foreign calls are left for their owner"; the same rule applies to us
 *     in reverse). Posting an error here would steal the call from the
 *     desktop and kill the turn.
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
import { toast } from "sonner";

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
import { isWarRoomMasterToolName } from "@/features/agents/war-room-master-tools/tools/names";
import { dispatchWarRoomMasterTool } from "@/features/agents/war-room-master-tools/dispatcher/dispatch-war-room-master-tool.thunk";
import { isScribeToolName } from "@/features/agents/scribe-tools/tools/names";
import { dispatchScribeTool } from "@/features/agents/scribe-tools/dispatcher/dispatch-scribe-tool.thunk";
import { getLiveDesktopInstance } from "../client-capabilities/desktop-presence";
import { watchDesktopDelegation } from "./watch-desktop-delegation.thunk";

/**
 * Desktop mega-tools bound to the `matrx-local` executor (tool.definition
 * rows in the desktop bundle taxonomy — 19 `local_*` tools as of 2026-07-14,
 * loaded on demand by the server-side `load_desktop_tools`). The
 * `tool_delegated` event carries no executor field, so the name family IS the
 * client-side contract — the same one matrx-local's own engine uses to claim
 * calls (`get_by_cloud_name(tool_name)` over its `local_*` catalog).
 */
function isDesktopDelegatedToolName(toolName: string): boolean {
  return toolName.startsWith("local_");
}

export interface SurfaceDelegatedToolCallArgs {
  conversationId: string;
  /**
   * The client-side execution request key used by Redux lifecycle state. This
   * is deliberately not the persisted chat.user_request UUID.
   */
  requestId: string;
  /** The server-owned chat.user_request UUID used for ledger reads and resume. */
  userRequestId?: string;
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
    const {
      conversationId,
      requestId,
      userRequestId,
      callId,
      toolName,
      data,
      event,
    } = args;

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
      // tile's Agent conversation (ThreadAgentPanel registers them per-conversation
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

    if (isWarRoomMasterToolName(toolName)) {
      // War Room MASTER tools (war_room_read_thread / _message_thread /
      // _create_room / _rename_room). Armed ONLY on the /war-room/all master
      // conversation (useMasterAgent registers them per-conversation). The
      // dispatcher validates args, resolves the target thread/room, and runs the
      // action IMMEDIATELY (notify-and-watch — no approval pause); messaging a
      // thread also opens a live-watch window + toast. It POSTs the result
      // through the same funnel so the suspended master loop resumes once.
      dispatch(
        dispatchWarRoomMasterTool({
          conversationId,
          requestId,
          callId,
          toolName,
          args: (data?.arguments as Record<string, unknown>) ?? {},
        }),
      );
      return;
    }

    if (isScribeToolName(toolName)) {
      // Scribe tools (scribe_play_audio). Armed ONLY on a Scribe session's
      // assistant conversation (ScribeScreen.addClientTool). Notify-and-play:
      // the dispatcher validates args, resolves the bound session, triggers the
      // session player to seek+play the clip, and POSTs the result immediately —
      // no approval pause (playing the user's own recording is non-destructive).
      dispatch(
        dispatchScribeTool({
          conversationId,
          requestId,
          callId,
          toolName,
          args: (data?.arguments as Record<string, unknown>) ?? {},
        }),
      );
      return;
    }

    const postUnsupportedError = () => {
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

    // Desktop-executor tools (`local_*` mega-tools bound to matrx-local).
    // The web has no handler by design — the DESKTOP is the executor. While a
    // desktop is online, leave the durable `delegated` row alone: the
    // matrx-local engine polls the same ledger, executes, POSTs the result,
    // and resumes the loop headlessly. Answering here with an error would
    // steal the call from its owner. Presence is re-checked (not just assumed
    // from the capability declaration) so a desktop that vanished mid-turn
    // falls through to the loud unsupported error instead of wedging forever.
    if (isDesktopDelegatedToolName(toolName)) {
      dispatch(setInstanceStatus({ conversationId, status: "paused" }));
      void getLiveDesktopInstance()
        .then((desktop) => {
          if (desktop) {
            console.info(
              `[desktop-native] '${toolName}' (call ${callId}) left pending for desktop "${desktop.instanceName}" — the matrx-local engine executes and resumes it.`,
            );
            dispatch(
              watchDesktopDelegation({
                conversationId,
                lifecycleRequestId: requestId,
                userRequestId,
                callId,
              }),
            );
            return;
          }
          console.error(
            `[desktop-native] '${toolName}' was delegated but no desktop is online — posting unsupported_client_tool so the turn doesn't wedge.`,
          );
          postUnsupportedError();
        })
        .catch((error) => {
          console.error(
            `[desktop-native] presence lookup failed for '${toolName}' — retaining the call for durable desktop reconciliation.`,
            error,
          );
          toast.error("Desktop connection status is unavailable", {
            description:
              "The tool call is still waiting safely and will be reconciled when the desktop responds.",
          });
          dispatch(
            watchDesktopDelegation({
              conversationId,
              lifecycleRequestId: requestId,
              userRequestId,
              callId,
            }),
          );
        });
      return;
    }

    // Unknown delegated tool — neither a widget nor a ui-first tool. The
    // backend hard-suspended the loop awaiting a result; sitting on `paused`
    // would silently wedge it. Flip to `paused` for a truthful state during the
    // microtask window, then POST an error result through the funnel so the
    // server can recover or surface the failure.
    dispatch(setInstanceStatus({ conversationId, status: "paused" }));
    postUnsupportedError();
  };
};
