"use client";

/**
 * BatchAskCard — the wizard for a batched `user` ask (multiple questions sharing
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

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { PendingAsk } from "../redux/pending-asks.slice";
import {
  resolvePendingAsk,
  cancelPendingAsk,
} from "../redux/pending-asks.slice";
import {
  resolveAskByCallId,
  cancelAskByCallId,
} from "../redux/ask-resolver-registry";
import type { AskUserResponse } from "../tools/schemas";
import { EMPTY_ASK_RESPONSE } from "../tools/schemas";
import { getAskDraft, setAskDraft } from "../redux/ask-draft-registry";
import { AskCardCountdown } from "./AskCardCountdown";
import { AgentCardShell } from "./AgentCardShell";
import {
  AskBody,
  WriteInsteadBody,
  presentation,
  type AskActionLabels,
} from "./AskCard";

const STEP_LABELS: AskActionLabels = { send: "Next", skip: "Skip" };
const FINAL_LABELS: AskActionLabels = {
  send: "Send answers",
  skip: "Skip & send",
};
const SKIPPED: AskUserResponse = { ...EMPTY_ASK_RESPONSE, cancelled: true };

interface BatchAskCardProps {
  /** All questions in the batch (any order — sorted by batchIndex here). */
  asks: PendingAsk[];
}

export function BatchAskCard({ asks }: BatchAskCardProps) {
  const dispatch = useAppDispatch();

  const ordered = useMemo(
    () => [...asks].sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0)),
    [asks],
  );
  const total = ordered.length;

  const [active, setActive] = useState(0);
  // Drafts keyed by callId (not positional index) so answers stay correct even
  // if the batch shrinks mid-session — e.g. a per-question timeout resolves one.
  // Seeded from the draft registry so a remount keeps every recorded answer.
  const [answers, setAnswers] = useState<Record<string, AskUserResponse>>(
    () => {
      const seeded: Record<string, AskUserResponse> = {};
      for (const a of asks) {
        const d = getAskDraft(a.callId);
        if (d) seeded[a.callId] = d;
      }
      return seeded;
    },
  );
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [writeMode, setWriteMode] = useState(false);
  const [writeText, setWriteText] = useState("");

  const clampedActive = Math.min(active, total - 1);
  const activeAsk = ordered[clampedActive];
  const isFinal = clampedActive === total - 1;
  const answeredCount = ordered.filter(
    (a) => answers[a.callId] && !answers[a.callId].cancelled,
  ).length;
  const pending = activeAsk.status !== "pending";

  /**
   * Record one question's answer (or its skip). On every question but the last
   * this advances; on the LAST question it sends the whole batch immediately —
   * the last "Next" is the submit, never a separate click.
   */
  function recordAnswer(
    index: number,
    callId: string,
    response: AskUserResponse,
  ) {
    const next = { ...answers, [callId]: response };
    setAnswers(next);
    setAskDraft(callId, response.cancelled ? null : response);
    if (index === total - 1) {
      submitAll(next);
      return;
    }
    setActive(index + 1);
  }

  function resolveEach(
    build: (ask: PendingAsk, index: number) => AskUserResponse,
  ) {
    ordered.forEach((ask, index) => {
      resolveAskByCallId(ask.callId, build(ask, index));
      dispatch(
        resolvePendingAsk({
          callId: ask.callId,
          conversationId: ask.conversationId,
        }),
      );
    });
  }

  /**
   * Send every question: its recorded answer, else the body's live draft (the
   * user typed/picked but never pressed Next), else skipped. Always possible —
   * unanswered questions never block the send.
   */
  function submitAll(recorded: Record<string, AskUserResponse>) {
    const note = additionalInstructions.trim();
    resolveEach((ask, index) => {
      const resp = recorded[ask.callId] ?? getAskDraft(ask.callId) ?? SKIPPED;
      // The batch note rides on the final answer (handler reads it back up).
      return note && index === total - 1
        ? { ...resp, additional_instructions: note }
        : resp;
    });
  }

  function skipAll() {
    ordered.forEach((ask) => {
      cancelAskByCallId(ask.callId);
      dispatch(
        cancelPendingAsk({
          callId: ask.callId,
          conversationId: ask.conversationId,
        }),
      );
    });
  }

  function sendWriteInstead() {
    const text = writeText.trim();
    if (!text) return;
    // Freeform reply short-circuits the whole batch; carry the text on the first.
    resolveEach((_ask, index) => ({
      ...EMPTY_ASK_RESPONSE,
      wrote_instead: true,
      freeform: index === 0 ? text : null,
    }));
  }

  const p = presentation(activeAsk);

  return (
    <AgentCardShell
      tone={p.tone}
      icon={p.Icon}
      eyebrow={p.eyebrow}
      subtitle={p.subtitle}
      title={p.title}
      badge={`${clampedActive + 1} of ${total}`}
      onDismiss={skipAll}
      dismissLabel="Skip all questions"
      pending={pending}
      bottomSlot={
        typeof activeAsk.expiresAtMs === "number" ? (
          <AskCardCountdown
            expiresAtMs={activeAsk.expiresAtMs}
            className="absolute bottom-0 left-0 right-0 rounded-none"
          />
        ) : null
      }
      aria-label={`Question ${clampedActive + 1} of ${total} from agent: ${activeAsk.question ?? ""}`}
    >
      {writeMode ? (
        <WriteInsteadBody
          value={writeText}
          onChange={setWriteText}
          onSend={sendWriteInstead}
          onSkip={skipAll}
          onBack={() => {
            setWriteMode(false);
            setWriteText("");
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Every body stays mounted so per-question state (selection, typed
              text) survives navigation. Only the active one is visible. */}
          {ordered.map((ask, index) => (
            <div
              key={ask.callId}
              className={index === clampedActive ? "" : "hidden"}
            >
              <AskBody
                ask={ask}
                onAnswer={(r) => recordAnswer(index, ask.callId, r)}
                onSkip={() => recordAnswer(index, ask.callId, SKIPPED)}
                onDraft={(r) => setAskDraft(ask.callId, r)}
                labels={index === total - 1 ? FINAL_LABELS : STEP_LABELS}
              />
            </div>
          ))}

          {/* Wizard navigation — Back / Next appear whenever a prior / next
              question exists; dots jump directly and show answered state. */}
          <div className="flex items-center gap-2 border-t border-border/60 pt-2.5">
            {clampedActive > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActive((i) => Math.max(0, i - 1))}
                className="gap-1 px-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
            ) : (
              <span className="w-[4.25rem]" aria-hidden />
            )}

            <div className="mx-auto flex items-center gap-1.5">
              {ordered.map((ask, index) => (
                <button
                  key={ask.callId}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={`Go to question ${index + 1}${
                    answers[ask.callId]
                      ? answers[ask.callId].cancelled
                        ? " (skipped)"
                        : " (answered)"
                      : ""
                  }`}
                  aria-current={index === clampedActive}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    answers[ask.callId] && !answers[ask.callId].cancelled
                      ? "bg-primary"
                      : "bg-border",
                    index === clampedActive &&
                      "ring-2 ring-primary/40 ring-offset-1 ring-offset-card",
                  )}
                />
              ))}
            </div>

            {!isFinal ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActive((i) => Math.min(total - 1, i + 1))}
                className="gap-1 px-2 text-muted-foreground hover:text-foreground"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <span className="w-[4.25rem]" aria-hidden />
            )}
          </div>

          {/* Optional batch-level note — on the final question only, where the
              send happens (the contract: the note rides on the last card). */}
          {isFinal && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Anything else? (optional)
              </div>
              <Textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="Add a note for the agent…"
                rows={2}
                className="text-base"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {isFinal
                ? `${answeredCount} of ${total} answered — sending on the button above`
                : `${answeredCount} of ${total} answered`}
            </span>
            <button
              type="button"
              onClick={() => setWriteMode(true)}
              className="ml-auto text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Write message instead
            </button>
          </div>
        </div>
      )}
    </AgentCardShell>
  );
}
