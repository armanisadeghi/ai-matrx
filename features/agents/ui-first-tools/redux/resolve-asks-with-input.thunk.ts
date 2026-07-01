/**
 * Guard the "on-deck" delegated tool against a colliding chat submit.
 *
 * When the user types in the main composer and hits Send WHILE one or more
 * delegated tool asks are still pending for this conversation, starting a fresh
 * turn would leave those tool calls dangling: the server still has outstanding
 * `delegated` `cx_tool_call` rows, the new turn cannot resume them, and the
 * agent side of that tool call never receives a result (a "failed tool call
 * with no result"). See `features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md`.
 *
 * So the submit is never allowed to leave an ask on deck. Instead we deliver the
 * composer text as the ANSWER to every pending ask:
 *
 *   - text present → resolve each ask as a write-instead freeform reply
 *     (`{wrote_instead, freeform}`) — identical to the card's "Write message
 *     instead" escape. For `approval`-kind asks this maps to "instructions"
 *     (the war-room dispatcher treats a freeform envelope as instructions), so a
 *     stray Send NEVER silently approves a destructive write.
 *   - text empty → cancel each ask (an empty, non-error tool result) so nothing
 *     dangles.
 *
 * Resolving fires each ask's awaiting handler → `submitToolResult` →
 * `continuation_needed` → `resumeInstance`, so the conversation continues with
 * the user's message embedded in the tool result. No separate turn is started —
 * that is why the caller MUST skip `executeInstance` when this returns true.
 *
 * Mirrors the exact card semantics: `resolveAskByCallId` (delivers the envelope
 * to the handler's promise) + `resolvePendingAsk`/`cancelPendingAsk` (fades the
 * card) + a delayed `sweepPendingAsks` (removes it after the fade).
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  selectActivePendingAsksForConversation,
  resolvePendingAsk,
  cancelPendingAsk,
  sweepPendingAsks,
} from "./pending-asks.slice";
import { resolveAskByCallId, cancelAskByCallId } from "./ask-resolver-registry";
import { EMPTY_ASK_RESPONSE } from "../tools/schemas";

/**
 * @returns `true` when it consumed the submit (asks were pending and at least
 *   one was resolved) — the caller MUST then skip `executeInstance`. `false`
 *   when there were no pending asks (or none had a live resolver), in which case
 *   the normal turn should proceed.
 */
export function resolvePendingAsksWithInput(
  conversationId: string,
  text: string,
) {
  return (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const asks =
      selectActivePendingAsksForConversation(conversationId)(getState());
    if (asks.length === 0) return false;

    const trimmed = text.trim();
    let handledAny = false;

    for (const ask of asks) {
      const ok = trimmed
        ? resolveAskByCallId(ask.callId, {
            ...EMPTY_ASK_RESPONSE,
            wrote_instead: true,
            freeform: trimmed,
          })
        : cancelAskByCallId(ask.callId);

      // No live resolver (should not happen for an active ask) → leave the card
      // visible rather than hiding a still-dangling tool call. Loud, not silent.
      if (!ok) {
        console.error(
          `[pending-asks] submit-on-deck: no resolver for callId "${ask.callId}" ` +
            `on conversation "${conversationId}"; the card was left visible.`,
        );
        continue;
      }

      handledAny = true;
      dispatch(
        trimmed
          ? resolvePendingAsk({ callId: ask.callId, conversationId })
          : cancelPendingAsk({ callId: ask.callId, conversationId }),
      );
    }

    if (handledAny) {
      queueMicrotask(() => {
        setTimeout(() => dispatch(sweepPendingAsks(conversationId)), 250);
      });
    }

    return handledAny;
  };
}
