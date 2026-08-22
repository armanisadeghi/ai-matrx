"use client";

/**
 * ServerOperationBanner — the persistent reconnect indicator, driven by
 * runtime state (`conversation.serverOperation`, stamped
 * from the `/runtime` reconnect surface) so it survives a page refresh.
 *
 * Renders above the composer beside PendingAsksZone. Four evidence-backed faces:
 *   running / paused — the turn is executing server-side; the follower will
 *                      load the finished message automatically.
 *   waiting + ask    — the pending ask inbox proves user input is owed; Show
 *                      question focuses/reopens the actual answer surface.
 *   waiting + no ask — reconnect checks the durable call ledger, auto-resumes
 *                      a resolved request, and retains Check/Continue actions.
 * Clears itself the moment the operation settles or a live stream takes over.
 */

import {
  CircleDashed,
  Loader2,
  MessageCircleQuestion,
  Play,
} from "lucide-react";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { ServerOperationState } from "./types";
import { selectActivePendingAsksForConversation } from "../ui-first-tools/redux/pending-asks.slice";
import { resumeInstance } from "../redux/execution-system/thunks/resume-instance.thunk";
import { reconnectServerOperation } from "./reconnect-server-operation.thunk";

export function ServerOperationBanner({
  conversationId,
}: {
  conversationId: string;
}) {
  const dispatch = useAppDispatch();
  const [actionBusy, setActionBusy] = useState(false);
  const operation = useAppSelector(
    (state): ServerOperationState | null =>
      state.conversations?.byConversationId?.[conversationId]
        ?.serverOperation ?? null,
  );
  const pendingAsks = useAppSelector(
    selectActivePendingAsksForConversation(conversationId),
  );
  if (!operation) return null;

  const waiting =
    operation.status === "waiting_input" || operation.waitingInput;

  const showQuestion = () => {
    const zone = document.getElementById(`pending-asks-${conversationId}`);
    zone?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    zone?.querySelector<HTMLButtonElement>("[data-open-pending-asks]")?.click();
  };

  const continueAgent = () => {
    if (actionBusy) return;
    setActionBusy(true);
    const shouldRecheck =
      !operation.userRequestId ||
      operation.recoveryState === "checking_for_prompt" ||
      operation.recoveryState === "pending_tool";
    const action =
      !shouldRecheck && operation.userRequestId
        ? dispatch(
            resumeInstance({
              conversationId,
              userRequestId: operation.userRequestId,
            }),
          )
        : dispatch(
            reconnectServerOperation({ conversationId, source: "cold-load" }),
          );
    void action.finally(() => setActionBusy(false));
  };

  const hasQuestion = pendingAsks.length > 0;
  const continuing = operation.recoveryState === "continuing";
  const shouldRecheck =
    !operation.userRequestId ||
    operation.recoveryState === "checking_for_prompt" ||
    operation.recoveryState === "pending_tool";

  let message = "Reconnecting to your response…";
  if (waiting && hasQuestion) {
    message =
      pendingAsks.length === 1
        ? "The agent needs your answer."
        : `The agent has ${pendingAsks.length} questions for you.`;
  } else if (waiting && operation.recoveryState === "continuing") {
    message = "No answer is needed — continuing the agent now.";
  } else if (waiting && operation.recoveryState === "checking_for_prompt") {
    message = "Checking the agent’s pending action…";
  } else if (waiting && operation.recoveryState === "pending_tool") {
    message = "Finishing the agent’s pending tool action…";
  } else if (waiting) {
    message = "The agent paused without a visible question.";
  }

  return (
    <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
      {waiting && hasQuestion ? (
        <MessageCircleQuestion className="h-4 w-4 shrink-0 text-primary" />
      ) : waiting ? (
        <CircleDashed className="h-4 w-4 shrink-0 text-primary" />
      ) : (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      )}
      <span className="min-w-0 flex-1">{message}</span>
      {waiting && hasQuestion && (
        <button
          type="button"
          onClick={showQuestion}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Show {pendingAsks.length === 1 ? "question" : "questions"}
        </button>
      )}
      {waiting && !hasQuestion && !continuing && (
        <button
          type="button"
          onClick={continueAgent}
          disabled={actionBusy}
          className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {actionBusy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Play className="size-3" />
          )}
          {shouldRecheck ? "Check again" : "Continue agent"}
        </button>
      )}
    </div>
  );
}
