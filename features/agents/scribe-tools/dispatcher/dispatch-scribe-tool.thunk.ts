/**
 * dispatchScribeTool — turns a delegated scribe tool call into execution +
 * result, mirroring `dispatchWarRoomMasterTool`'s NOTIFY-AND-PLAY model (no HITL
 * pause): playing back the user's own recording is non-destructive, so the tool
 * runs immediately, the result posts, and the suspended loop resumes once.
 *
 * Safety without an approval gate:
 *   1. Args are Zod-validated before anything runs (malformed ⇒ clean error).
 *   2. The handler resolves its target session and refuses cleanly (`ok:false`)
 *      when none is bound — never guesses.
 *   3. Every result goes through the single `submitToolResult` funnel so the
 *      hard-suspended loop resumes exactly once. We never throw.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { upsertToolLifecycle } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { getScribeToolEntry } from "../tools/registry";
import { isScribeToolName } from "../tools/names";

export interface DispatchScribeToolPayload {
  conversationId: string;
  requestId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export const dispatchScribeTool = createAsyncThunk<
  void,
  DispatchScribeToolPayload,
  { state: RootState }
>(
  "scribeTools/dispatch",
  async (
    { conversationId, requestId, callId, toolName, args },
    { dispatch, getState },
  ) => {
    const state = getState();
    const userId = state.userAuth?.id ?? null;

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
    if (!isScribeToolName(toolName)) {
      fail("unknown_tool", `Unknown scribe tool: ${toolName}`);
      return;
    }

    const entry = getScribeToolEntry(toolName);
    if (!entry) {
      fail("unknown_tool", `Unknown scribe tool: ${toolName}`);
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
