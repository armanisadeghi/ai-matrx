"use client";

/**
 * QuestionsAskForm — `ask_person(kind="questions")` drawn as the AskCard
 * wizard. The questions come from the SERVER'S stored request (its render
 * spec), so the card is rebuilt from the row after a reload or on another
 * device, and the answer goes back through whichever door the caller owns
 * (the chat's signed-in completion, or the `/q/<token>` link).
 *
 * The answer is exactly the retired `user` tool's batched envelope:
 * `{answers: [{answer, selected, confirmed, action, freeform, cancelled}],
 *   cancelled, wrote_instead, additional_instructions}` — one entry per
 * question, by position.
 */

import { useMemo, type ReactNode } from "react";

import type { PendingAsk } from "../redux/pending-asks.slice";
import { AskWizard, type AskWizardResult } from "./AskWizard";

export interface QuestionsAskSpec {
  type: "confirm" | "choice" | "choice_many" | "text" | "notify";
  question?: string;
  header?: string;
  context?: string;
  options?: { label: string; description?: string; preview?: string }[];
  allow_other?: boolean;
  message?: string;
  actions?: string[];
  level?: "info" | "success" | "warning" | "error";
}

/** The server result body for a `questions` ask (aidream `QuestionsResult`). */
export function questionsResultBody(result: AskWizardResult): Record<string, unknown> {
  return {
    answers: result.answers.map((a) => ({
      answer: a.answer,
      selected: a.selected,
      confirmed: a.confirmed,
      action: a.action,
      freeform: a.freeform,
      cancelled: a.cancelled,
    })),
    cancelled: result.cancelled,
    wrote_instead: result.wrote_instead,
    additional_instructions: result.additional_instructions,
  };
}

/** Server question specs → the wizard's ask shape. Pure; exported for tests. */
export function questionsToAsks(
  askKey: string,
  questions: QuestionsAskSpec[],
): PendingAsk[] {
  return questions.map((q, index) => ({
    callId: `${askKey}.${index}`,
    conversationId: askKey,
    toolName: "ask_person",
    kind: q.type,
    question: q.question,
    header: q.header,
    context: q.context,
    options: q.options,
    allowOther:
      q.type === "choice" || q.type === "choice_many"
        ? q.allow_other !== false
        : q.allow_other,
    message: q.message,
    actions: q.actions,
    level: q.level,
    batchId: askKey,
    batchIndex: index,
    batchTotal: questions.length,
    status: "pending",
    createdAtMs: 0,
  }));
}

export function QuestionsAskForm({
  askKey,
  questions,
  busy,
  notice,
  onSubmit,
}: {
  /** Stable per ask (the request id) — keys every question's draft. */
  askKey: string;
  questions: QuestionsAskSpec[];
  busy: boolean;
  notice?: ReactNode;
  onSubmit: (resultBody: Record<string, unknown>) => void;
}) {
  const asks = useMemo(() => questionsToAsks(askKey, questions), [askKey, questions]);
  return (
    <AskWizard
      asks={asks}
      busy={busy}
      notice={notice}
      onSend={(result) => onSubmit(questionsResultBody(result))}
    />
  );
}
