/**
 * dispatchSurfaceWrite — turns the delegated `apply_surface_write` tool call
 * (injected by build-tool-injection whenever the mounted surface stack has
 * agent-writable targets) into a real page write through the ONE writeback
 * seam: `applySurfaceWrite(target, value, { origin: "agent" })`.
 *
 * This is the stream side of the surfaces 360 loop — the first live caller
 * of the seam's agent-origin branch. The apply-policy machinery does all the
 * governing: `auto` applies, `ask` shows a non-blocking inline approval card
 * (naming the agent via `actorLabel`), `manual` is refused loudly, and per-run binding
 * overrides (`registerSurfaceWritePolicies`) are resolved inside the seam.
 *
 * Result contract back to the model (via the single `submitToolResult`
 * funnel, so the hard-suspended loop always resumes exactly once):
 *  - applied        → `{ ok: true, surface_name, target, mode, message,
 *    result? }` — for draft mode the output says the user still has to save;
 *    `message` carries the handler's `SurfaceWriteOutcome.summary` and
 *    `result` its `data` (what landed: ids, names), so the model never has to
 *    re-read a list that may not show the new rows yet. Every success also
 *    carries THE WRITE RECEIPT: `status: "applied_now"`, `applied_at`, and
 *    `change: { page_value, before, written, same_as_before? }`, and the
 *    message ends with `surfaceWriteReceiptSentence` — so the model never
 *    reads its own effect in the refreshed page values as "already there".
 *  - user declined  → is_error FALSE with `{ ok: false, declined: true }`.
 *    A decline is an answer, not a failure — an error result would invite the
 *    model to retry the exact write the user just refused.
 *  - refused/failed → is_error TRUE with `reason` (`surface_write_refused`
 *    before the card / `surface_write_failed` otherwise), `stage`
 *    (`before_approval` | `after_approval` | `apply` | `not_applied`) and ONE self-contained
 *    sentence — identical in `output.message` and `error_message` — naming
 *    whether the user was asked/approved, the page's own message, and the
 *    next step (`surfaceWriteFailureSentence`).
 *  - nothing open can apply it → is_error TRUE with `reason:
 *    "surface_not_available"`. Wall W49 (2026-09-12): the conversation outlives
 *    the page it was launched from, so this tool can be armed on a tab (a plain
 *    `/chat/<id>`) that mounts no surface at all. The page says so on screen
 *    with the remedy, and the model is handed the same sentence — it must
 *    report the write did not happen, never narrate a success.
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
import { surfaceWriteToolOutput } from "@/features/surfaces/runtime/surface-write-tool-output";
import { createSurfaceToolCall } from "./surface-tool-call";
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
      // The call's agent-write options (origin, actor, THIS call's approval
      // card) — built once, shared with every surface tool that writes.
      const call = await createSurfaceToolCall({
        conversationId,
        callId,
        toolName,
        dispatch,
        getState,
      });

      // Two open screens (the surface chain) may declare the same target
      // name; the agent may name the one it means. Omitted = deepest wins.
      const surfaceArg =
        typeof args.surface === "string" && args.surface.trim()
          ? { surfaceName: args.surface.trim() }
          : {};
      const result = await applySurfaceWrite(target, args.value, {
        ...surfaceArg,
        ...call.agentWrite,
      });

      // ONE formatter for every agent write (surface-write-tool-output.ts):
      // the receipt on success, a decline that is not an error, the W49
      // "nothing open can apply it", and one self-contained failure sentence.
      const { output, errorMessage } = surfaceWriteToolOutput(
        target,
        result,
        call.approvedByUser(),
      );
      finish(output, errorMessage);
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
