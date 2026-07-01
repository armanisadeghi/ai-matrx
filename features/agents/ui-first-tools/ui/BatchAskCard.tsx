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
 *   - Nothing is sent to the agent until every question has a recorded answer
 *     and the user hits "Submit". Skip cancels the whole batch; "Write message
 *     instead" resolves the whole batch as a freeform reply.
 *
 * Resolution model: the handler (`user.handler.ts#runBatched`) enqueues all N
 * questions up front and awaits all N resolvers via `Promise.all`. This card
 * resolves them together — so the agent's batch result is identical to the old
 * sequential flow; only the UX changed.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
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
import { AskCardCountdown } from "./AskCardCountdown";
import { AgentCardShell } from "./AgentCardShell";
import { AskBody, WriteInsteadBody, presentation } from "./AskCard";

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
  const [answers, setAnswers] = useState<Record<string, AskUserResponse>>({});
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [writeMode, setWriteMode] = useState(false);
  const [writeText, setWriteText] = useState("");

  const clampedActive = Math.min(active, total - 1);
  const activeAsk = ordered[clampedActive];
  const answeredCount = ordered.filter((a) => answers[a.callId]).length;
  const allAnswered = answeredCount === total;
  const pending = activeAsk.status !== "pending";

  function recordAnswer(
    index: number,
    callId: string,
    response: AskUserResponse,
  ) {
    setAnswers((prev) => ({ ...prev, [callId]: response }));
    // Convenience auto-advance; the user can still freely go back to edit.
    setActive((cur) => (index < total - 1 ? index + 1 : cur));
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

  function submitAll() {
    if (!allAnswered) return;
    const note = additionalInstructions.trim();
    resolveEach((ask, index) => {
      const resp = answers[ask.callId]!;
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
                isLast={false}
                onAnswer={(r) => recordAnswer(index, ask.callId, r)}
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
                  aria-label={`Go to question ${index + 1}${answers[ask.callId] ? " (answered)" : ""}`}
                  aria-current={index === clampedActive}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    answers[ask.callId] ? "bg-primary" : "bg-border",
                    index === clampedActive &&
                      "ring-2 ring-primary/40 ring-offset-1 ring-offset-card",
                  )}
                />
              ))}
            </div>

            {clampedActive < total - 1 ? (
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

          {/* Optional batch-level note. */}
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

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={submitAll}
              disabled={!allAnswered}
              className="gap-1.5"
            >
              <Send className="size-3.5" />
              Submit {total} answers
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {allAnswered
                ? "All answered — ready to send"
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
