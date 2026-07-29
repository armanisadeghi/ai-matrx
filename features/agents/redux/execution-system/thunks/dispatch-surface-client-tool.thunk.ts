/**
 * dispatchSurfaceClientTool — turns a delegated SURFACE client tool call
 * (declared in `SurfaceManifest.clientTools`, handled by the mounted page via
 * `useSurfaceClientTools`) into execution + result, mirroring
 * `dispatchScribeTool`'s run-immediately model: the tool executes through the
 * ONE surface client-tool runtime (`executeSurfaceClientTool` — deepest
 * declaring mounted surface wins), the result posts through the single
 * `submitToolResult` funnel, and the hard-suspended loop resumes exactly once.
 *
 * Safety without an approval gate here:
 *   1. Argument shape is enforced by the server against the inline spec's
 *      JSON Schema before the call is ever delegated; the page handler owns
 *      any deeper validation.
 *   2. `executeSurfaceClientTool` NEVER throws — every contract break (tool
 *      undeclared on any mounted surface, declared with no handler, handler
 *      threw) comes back as a loud `{ok:false}` envelope (toast +
 *      captureError) which we post as an error result so the loop never
 *      wedges.
 *   3. A tool whose `mode` implies persistence should gate INSIDE its
 *      handler (or route through `applySurfaceWrite`, which carries the
 *      apply-policy machinery) — the dispatcher stays policy-free.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { upsertToolLifecycle } from "../active-requests/active-requests.slice";
import { executeSurfaceClientTool } from "@/features/surfaces/runtime/surface-client-tools";

export interface DispatchSurfaceClientToolPayload {
  conversationId: string;
  requestId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export const dispatchSurfaceClientTool = createAsyncThunk<
  void,
  DispatchSurfaceClientToolPayload,
  { state: RootState }
>(
  "surfaceClientTools/dispatch",
  async ({ conversationId, requestId, callId, toolName, args }, { dispatch }) => {
    const startedAt = performance.now();

    const finish = (
      output: Record<string, unknown>,
      errorMessage?: string,
    ): void => {
      const durationMs = Math.round(performance.now() - startedAt);
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: errorMessage ? "error" : "completed",
          isDelegated: true,
          result: output,
          ...(errorMessage
            ? {
                errorType: "surface_client_tool_failed",
                errorMessage,
              }
            : {}),
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: Boolean(errorMessage),
          output,
          duration_ms: durationMs,
          ...(errorMessage ? { error_message: errorMessage } : {}),
        }),
      );
    };

    try {
      const result = await executeSurfaceClientTool(toolName, args);
      if (result.ok) {
        finish({
          ok: true,
          surface_name: result.surfaceName,
          output: result.output ?? null,
        });
      } else {
        // Already reported loudly (toast + captureError) by the runtime.
        finish(
          { ok: false, reason: "surface_client_tool_failed", message: result.error },
          result.error,
        );
      }
    } catch (cause) {
      // executeSurfaceClientTool never throws by contract — reaching here
      // means the runtime itself broke. Still resume the loop, loudly.
      const message = extractErrorMessage(cause);
      console.error(
        `[surface-client-tools] runtime threw for '${toolName}' — contract break`,
        cause,
      );
      finish(
        { ok: false, reason: "surface_client_tool_runtime_threw", message },
        message,
      );
    }
  },
);
