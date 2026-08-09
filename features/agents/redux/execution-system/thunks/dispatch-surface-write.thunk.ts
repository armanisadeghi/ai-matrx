/**
 * dispatchSurfaceWrite — turns the delegated `apply_surface_write` tool call
 * (injected by build-tool-injection whenever the mounted surface stack has
 * agent-writable targets) into a real page write through the ONE writeback
 * seam: `applySurfaceWrite(target, value, { origin: "agent" })`.
 *
 * This is the stream side of the surfaces 360 loop — the first live caller
 * of the seam's agent-origin branch. The apply-policy machinery does all the
 * governing: `auto` applies, `ask` shows the in-place confirm (naming the
 * agent via `actorLabel`), `manual` is refused loudly, and per-run binding
 * overrides (`registerSurfaceWritePolicies`) are resolved inside the seam.
 *
 * Result contract back to the model (via the single `submitToolResult`
 * funnel, so the hard-suspended loop always resumes exactly once):
 *  - applied        → `{ ok: true, surface_name, target, mode }` — for draft
 *    mode the output says the user still has to save.
 *  - user declined  → is_error FALSE with `{ ok: false, declined: true }`.
 *    A decline is an answer, not a failure — an error result would invite the
 *    model to retry the exact write the user just refused.
 *  - refused/failed → is_error TRUE. `applySurfaceWrite` already reported it
 *    loudly (toast + captureError); the error message tells the model why.
 *
 * The instance is flipped to `paused` while the seam runs — an `ask` target
 * awaits a human, and `paused` is the honest state for that window (same
 * contract as dispatchUiFirstTool; resume flips it back).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { applySurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { upsertToolLifecycle } from "../active-requests/active-requests.slice";
import { setInstanceStatus } from "../conversations/conversations.slice";

export interface DispatchSurfaceWritePayload {
  conversationId: string;
  requestId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export const dispatchSurfaceWrite = createAsyncThunk<
  void,
  DispatchSurfaceWritePayload,
  { state: RootState }
>(
  "surfaceWriteback/dispatchAgentWrite",
  async (
    { conversationId, requestId, callId, toolName, args },
    { dispatch, getState },
  ) => {
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
            ? { errorType: "surface_write_failed", errorMessage }
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

    const target = args.target;
    if (typeof target !== "string" || !target.trim()) {
      // The server schema-validates against the inline spec, so reaching here
      // means the contract broke somewhere — answer loudly, never wedge.
      finish(
        {
          ok: false,
          reason: "invalid_arguments",
          message: "apply_surface_write requires a string `target`.",
        },
        "apply_surface_write requires a string `target`.",
      );
      return;
    }

    // Honest state while the seam runs — an `ask` target awaits the user.
    dispatch(setInstanceStatus({ conversationId, status: "paused" }));

    try {
      const state = getState();
      const agentId = state.conversations.byConversationId[conversationId]?.agentId;
      const actorLabel = agentId
        ? selectAgentById(state, agentId)?.name
        : undefined;

      const result = await applySurfaceWrite(target, args.value, {
        origin: "agent",
        actorLabel,
      });

      if (result.ok) {
        finish({
          ok: true,
          surface_name: result.surfaceName,
          target: result.target.name,
          mode: result.target.mode,
          message:
            result.target.mode === "draft"
              ? `"${result.target.label}" staged into the page's draft — the user still reviews and saves.`
              : result.target.mode === "entity"
                ? `"${result.target.label}" applied and saved.`
                : `"${result.target.label}" applied.`,
        });
        return;
      }

      if (result.declined) {
        // The user answered "keep as is". Deliberately NOT an error result.
        finish({ ok: false, declined: true, message: result.error });
        return;
      }

      // Refusal (manual policy), unwired handler, handler throw — already
      // reported loudly by the seam; tell the model why so it can adjust.
      finish(
        { ok: false, reason: "surface_write_failed", message: result.error },
        result.error,
      );
    } catch (cause) {
      // applySurfaceWrite never throws by contract — reaching here means the
      // seam itself broke. Still resume the loop, loudly.
      const message = extractErrorMessage(cause);
      console.error(
        `[surface-writeback] applySurfaceWrite threw for '${target}' — contract break`,
        cause,
      );
      finish(
        { ok: false, reason: "surface_write_runtime_threw", message },
        message,
      );
    }
  },
);
