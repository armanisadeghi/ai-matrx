/**
 * dispatchWarRoomMasterTool — parallels `dispatchWarRoomTool`, but for the
 * cross-room MASTER agent's tools, and with a DIFFERENT control model.
 *
 * The per-tile war-room tools HITL-gate every write (approve-each). The master's
 * tools follow the user's explicit design: NOTIFY-AND-WATCH, not approve-each.
 * So read / create / rename / message all run WITHOUT a pre-approval pause:
 *   - reads (war_room_read_thread) are obviously safe.
 *   - create/rename rooms are low-risk and reversible.
 *   - messaging a thread (war_room_message_thread) fires immediately AND opens a
 *     live-watch window + a toast (handled inside the handler) so the user SEES
 *     the run in real time and can step in.
 *
 * Safety still holds without an approval gate:
 *   1. Args are Zod-validated before anything runs (malformed ⇒ clean error).
 *   2. Each handler RESOLVES its target (thread via resolveThread, room by id)
 *      and refuses cleanly (`ok:false`) if it's unknown — never guesses.
 *   3. Every result goes through the single `submitToolResult` funnel so the
 *      hard-suspended master loop resumes exactly once. We never throw — a
 *      wedged loop is worse than a surfaced failure.
 *
 * Unlike the per-tile dispatcher we do NOT flip the instance to `paused`: there
 * is no human-in-the-loop wait here. The tool runs, the result posts, the loop
 * resumes. (The thread RUN the messaging tool kicks off streams into its OWN
 * conversation — watched in a window — independent of the master loop, which
 * only waits for this tool's small result.)
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { upsertToolLifecycle } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { getWarRoomMasterToolEntry } from "../tools/registry";
import { isWarRoomMasterToolName } from "../tools/names";

export interface DispatchWarRoomMasterToolPayload {
  conversationId: string;
  requestId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export const dispatchWarRoomMasterTool = createAsyncThunk<
  void,
  DispatchWarRoomMasterToolPayload,
  { state: RootState }
>(
  "warRoomMasterTools/dispatch",
  async (
    { conversationId, requestId, callId, toolName, args },
    { dispatch, getState },
  ) => {
    const state = getState();
    const userId = state.userAuth?.id ?? null;

    // Every exit goes through the funnel + closes the lifecycle (so the
    // LiveToolCallCard never shimmers waiting forever).
    const fail = (
      errorType: string,
      message: string,
      durationMs?: number,
    ): void => {
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "error",
          isDelegated: true,
          errorType,
          errorMessage: message,
          result: { ok: false, reason: errorType, message },
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: true,
          output: { ok: false, reason: errorType, message },
          error_message: message,
          ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
        }),
      );
    };

    const complete = (
      output: Record<string, unknown>,
      durationMs: number,
    ): void => {
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
          duration_ms: durationMs,
        }),
      );
    };

    if (!userId) {
      fail("unauthenticated", "user not authenticated");
      return;
    }
    if (!isWarRoomMasterToolName(toolName)) {
      fail("unknown_tool", `Unknown war-room master tool: ${toolName}`);
      return;
    }

    const entry = getWarRoomMasterToolEntry(toolName);
    if (!entry) {
      fail("unknown_tool", `Unknown war-room master tool: ${toolName}`);
      return;
    }

    const parsed = entry.schema.safeParse(args);
    if (!parsed.success) {
      fail(
        "schema",
        `args failed schema for ${toolName}: ${JSON.stringify(
          parsed.error.format(),
        )}`,
      );
      return;
    }

    // Run the real handler immediately (notify-and-watch — no approval pause).
    // Client-measured duration for cx_tool_call telemetry.
    const startedAt = performance.now();
    try {
      const result = await entry.handler.run(parsed.data, {
        conversationId,
        callId,
        userId,
        dispatch,
        getState,
      });
      complete(
        result as Record<string, unknown>,
        Math.round(performance.now() - startedAt),
      );
    } catch (cause) {
      fail(
        "handler_threw",
        extractErrorMessage(cause),
        Math.round(performance.now() - startedAt),
      );
    }
  },
);
