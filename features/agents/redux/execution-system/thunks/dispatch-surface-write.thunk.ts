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
import {
  applySurfaceWrite,
  type SurfaceWriteChange,
} from "@/features/surfaces/runtime/surface-writeback";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { resolveAgentName } from "@/features/surfaces/hooks/useAgentNames";
import { requestInlineApproval } from "@/features/agents/ui-first-tools/redux/request-approval";
import { buildSurfaceWriteApprovalChange } from "./surface-write-approval-change";
import { upsertToolLifecycle } from "../active-requests/active-requests.slice";
import { setInstanceStatus } from "../conversations/conversations.slice";

/**
 * The sentence the model reads when a write did not land. It always says
 * whether the person was asked, whether they approved, what the page said,
 * that nothing (or not all of it) was written, and what to do next.
 */
export function surfaceWriteFailureSentence(
  target: string,
  result: { error: string; phase?: "before_approval" | "apply"; refused?: true },
  approvedByUser: boolean,
): string {
  const reason = result.error.trim().replace(/[.\s]*$/, ".");
  // The page's own message may already end with the same assurance (the
  // collectProblems format does); say it once.
  const saysNothingChanged = /Nothing was changed\.$/.test(reason);
  const nothingChanged = saysNothingChanged ? "" : "Nothing was changed. ";
  if (result.phase === "before_approval") {
    return (
      `apply_surface_write("${target}") was refused before the user was asked: ${reason} ` +
      `${nothingChanged}Correct the value and call apply_surface_write again.`
    );
  }
  if (approvedByUser) {
    return (
      `The user approved the "${target}" write, but the page could not apply it: ${reason} ` +
      `The write did not complete. Tell the user what went wrong; if the value was the problem, ` +
      `correct it and call apply_surface_write again (the user will be asked again).`
    );
  }
  return (
    `apply_surface_write("${target}") did not complete: ${reason} ` +
    `${nothingChanged}Tell the user, or correct the value and call apply_surface_write again.`
  );
}

/**
 * The sentence every successful write ends with, so the model can never read
 * its own effect as a value that was already there (2026-09-27: three HR
 * employer writes landed once each, and the agent told the person the rows
 * "already existed" — because the page values it was handed next were re-read
 * AFTER the write and nothing said so).
 */
export function surfaceWriteReceiptSentence(
  change: SurfaceWriteChange | undefined,
): string {
  if (change?.sameAsBefore) {
    return (
      `The page already held exactly this value before this call, so the save re-applied it ` +
      `and nothing visible changed — tell the user it was already set.`
    );
  }
  const before =
    change?.before !== undefined && change.pageValue
      ? ` Before this call "${change.pageValue}" was: ${change.before}.`
      : "";
  return (
    `This call made this change just now${change ? ` (${change.appliedAt})` : ""}; it did not exist before this call.${before} ` +
    `Page values you receive after this result were re-read after the write, so they already include it — ` +
    `that is this write's effect, not an earlier value. Tell the user you made the change; do not write it again.`
  );
}

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

    // Whether the person pressed Approve on the card for THIS call — so a
    // handler failure after approval tells the model the person agreed and
    // the page still could not apply it (not "the user was never asked").
    let approvedByUser = false;

    try {
      const state = getState();
      const agentId = state.conversations.byConversationId[conversationId]?.agentId;
      // Resolve through the SAME module-cached lookup the header uses
      // (useAgentNames) so this never opens a second fetch path; fall back
      // to the agent-definition slice, which may already be hydrated.
      const actorLabel = agentId
        ? (await resolveAgentName(agentId)) ??
          selectAgentById(state, agentId)?.name
        : undefined;

      // Two open screens (the surface chain) may declare the same target
      // name; the agent may name the one it means. Omitted = deepest wins.
      const surfaceArg =
        typeof args.surface === "string" && args.surface.trim()
          ? { surfaceName: args.surface.trim() }
          : {};
      const result = await applySurfaceWrite(target, args.value, {
        ...surfaceArg,
        origin: "agent",
        actorLabel,
        // Provenance for the platform `surface_feedback` target's row.
        conversationId,
        ...(agentId ? { agentId } : {}),
        requestApproval: async (proposal) => {
          // THE CARD IS BUILT BY THE SHARED PRIMITIVE, never inline here: a
          // structured value travels as DATA and is rendered by the kind
          // pipeline, so the Expert sees the same rule card the Rulebook
          // draws instead of the payload. Read
          // `surface-write-approval-change.ts` for the defect this closed.
          const change = buildSurfaceWriteApprovalChange(proposal);
          const decision = await requestInlineApproval({
            conversationId,
            callId,
            toolName,
            change,
            dispatch,
          });
          if (decision.kind === "approved") {
            approvedByUser = true;
            return { kind: "approved" };
          }
          if (decision.kind === "instructions") {
            return { kind: "declined", instructions: decision.text };
          }
          return decision.kind === "rejected"
            ? { kind: "declined" }
            : { kind: "cancelled" };
        },
      });

      if (result.ok) {
        const label = result.target.label;
        const base =
          result.target.mode === "draft"
            ? `"${label}" staged into the page's draft — the user still reviews and saves.`
            : result.target.mode === "entity"
              ? `"${label}" applied and saved.`
              : `"${label}" applied.`;
        const summary = result.outcome?.summary;
        const change = result.change;
        finish({
          ok: true,
          // THE WRITE RECEIPT, unmistakable: this call made the change now.
          status: "applied_now",
          ...(change ? { applied_at: change.appliedAt } : {}),
          surface_name: result.surfaceName,
          target: result.target.name,
          mode: result.target.mode,
          message: [base, summary, surfaceWriteReceiptSentence(change)]
            .filter(Boolean)
            .join(" "),
          ...(change
            ? {
                change: {
                  ...(change.pageValue ? { page_value: change.pageValue } : {}),
                  ...(change.before !== undefined ? { before: change.before } : {}),
                  written: change.written,
                  ...(change.sameAsBefore ? { same_as_before: true } : {}),
                },
              }
            : {}),
          // WHAT LANDED (ids, names) as the page reported it — the page's list
          // may not show the new rows yet if you re-read it immediately, so
          // trust this over an immediate re-read and do not retry the write.
          ...(result.outcome?.data !== undefined
            ? { result: result.outcome.data }
            : {}),
        });
        return;
      }

      if (result.declined) {
        // The user answered "keep as is". Deliberately NOT an error result.
        const message =
          `${result.error} Nothing was changed. Do not retry the same write` +
          (result.instructions
            ? " — follow the user's instructions below instead."
            : " unless the user asks for it.");
        finish({
          ok: false,
          declined: true,
          message,
          ...(result.instructions ? { instructions: result.instructions } : {}),
        });
        return;
      }

      if (result.unapplicable) {
        // NOTHING OPEN CAN APPLY IT (wall W49). The conversation outlives the
        // page it was started on: a Conductor launched from `/masterwork/<id>/
        // conduct` keeps this tool armed when the user follows its own "open
        // the full conversation in a new tab" link to `/chat/<id>`, which
        // mounts no surface. The seam has already said so on screen with the
        // remedy; the model gets the SAME sentence under its own reason code
        // so it tells the user the write did not happen instead of narrating
        // a success it never had.
        finish(
          {
            ok: false,
            reason: "surface_not_available",
            message: result.error,
          },
          result.error,
        );
        return;
      }

      // Refused before the card (declared type, value contract, the page's
      // own `validate`) or failed in the handler. Every branch hands the model
      // ONE self-contained sentence — the same text in `output.message` and
      // `error_message`, so it arrives whichever the server forwards.
      const message = surfaceWriteFailureSentence(target, result, approvedByUser);
      finish(
        {
          ok: false,
          reason:
            result.phase === "before_approval"
              ? "surface_write_refused"
              : "surface_write_failed",
          stage:
            result.phase === "before_approval"
              ? "before_approval"
              : approvedByUser
                ? "after_approval"
                : result.phase === "apply"
                  ? "apply"
                  : "not_applied",
          ...(approvedByUser ? { user_approved: true } : {}),
          message,
        },
        message,
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
