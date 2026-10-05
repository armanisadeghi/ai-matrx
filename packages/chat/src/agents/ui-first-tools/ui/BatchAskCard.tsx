"use client";

/**
 * BatchAskCard (legacy redux driver; the wizard itself is <AskWizard>) — the wizard for a batched `user` ask (multiple questions sharing
 * a `batchId`). Renders ONE card with free back/forth navigation so the user is
 * never trapped answering in strict order — the whole point of this component.
 *
 * How it differs from the per-question <AskCard>:
 *   - Every question's body is mounted at once (only the active one is visible),
 *     so a body's local state (selected options, typed text) survives navigation
 *     — go back, review, edit, come forward again, nothing is lost.
 *   - Answering a body records a DRAFT (it does not resolve the agent's promise)
 *     and auto-advances to the next question as a convenience.
 *   - Back / Next controls are always shown whenever a prior / next question
 *     exists; progress dots let the user jump to any question directly.
 *   - NOBODY IS EVER FORCED TO ANSWER. Every question's primary button is live:
 *     "Next" with an answer, "Skip" without (records `{cancelled: true}` for
 *     that one question and advances). On the LAST question the same button
 *     reads "Send answers" / "Skip & send" and sends the whole batch — the last
 *     Next IS the submit; there is no extra Submit click after it. Questions the
 *     user never reached go out as skipped. The × dismiss skips the whole batch;
 *     "Write message instead" resolves the whole batch as a freeform reply.
 *   - Every recorded answer (and every body's in-progress answer) is mirrored to
 *     `ask-draft-registry`, so a submit from the chat composer sends what the
 *     user already answered instead of dropping it.
 *
 * Resolution model: the handler (`user.handler.ts#runBatched`) enqueues all N
 * questions up front and awaits all N resolvers via `Promise.all`. This card
 * resolves them together. A skipped question is `cancelled: true` on its own
 * envelope; the batch-level `cancelled` is true only when EVERY question was
 * skipped (the user dismissed the batch).
 */

import { useAppDispatch } from "../../../store/hooks";
import type { PendingAsk } from "../redux/pending-asks.slice";
import { resolvePendingAsk } from "../redux/pending-asks.slice";
import { resolveAskByCallId } from "../redux/ask-resolver-registry";
import { AskWizard } from "./AskWizard";

interface BatchAskCardProps {
  /** All questions in the batch (any order — sorted by batchIndex here). */
  asks: PendingAsk[];
}

export function BatchAskCard({ asks }: BatchAskCardProps) {
  const dispatch = useAppDispatch();
  const ordered = [...asks].sort(
    (a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0),
  );
  return (
    <AskWizard
      asks={ordered}
      onSend={(result) => {
        ordered.forEach((ask, index) => {
          const resp = result.answers[index];
          resolveAskByCallId(
            ask.callId,
            result.additional_instructions && index === ordered.length - 1
              ? { ...resp, additional_instructions: result.additional_instructions }
              : resp,
          );
          dispatch(
            resolvePendingAsk({ callId: ask.callId, conversationId: ask.conversationId }),
          );
        });
      }}
    />
  );
}
