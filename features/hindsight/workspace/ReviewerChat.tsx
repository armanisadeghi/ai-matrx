"use client";

/**
 * ReviewerChat — the CENTER of the improvement workspace: a full-height
 * conversation with the reviewer that read this agent's real transcripts.
 *
 * This is the heart of the product: the user tells the reviewer what it got
 * right or wrong, and the reviewer comes back with better proposals. Three
 * rules inherited from the proven DiscussPanel (keep them):
 *
 *   1. A reply usually creates NEW findings rather than editing one — the
 *      right rail refetches on resolve, and the UI says so plainly.
 *   2. A reply takes about a minute (a frontier model re-reads the thread and
 *      the transcripts). Show elapsed time, never a bare spinner.
 *   3. `status: "failed"` is a normal outcome to render, and the human's typed
 *      words STAY in the composer — a carefully written paragraph is never
 *      lost to a transient error.
 *
 * Thread text is PROSE split server-side from the reviewer's structured
 * payload — never sniff it for JSON (a server regression, fix it there).
 * Bodies render through `MarkdownStream` in persisted mode, never hand-drawn.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, MessageSquare, RefreshCw, Send, X } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";

import { discussFinding, discussReview, getReviewThread } from "../api";
import type { Finding, Review } from "../types";
import { ThreadMessageRow } from "../components/ThreadMessageRow";
import { fmtCost, fmtDate, fmtElapsed } from "../components/tokens";

function Elapsed({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [startedAt]);
  return <span className="tabular-nums">{fmtElapsed(elapsed)}</span>;
}

/** The review's own conclusions, rendered as the reviewer's opening message. */
function ReviewIntro({ review }: { review: Review }) {
  if (!review.summary && !review.what_worked) return null;
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-border bg-card px-3 py-2">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Reviewer — after reading {review.example_count} real{" "}
            {review.example_count === 1 ? "run" : "runs"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {fmtDate(review.created_at)}
          </span>
        </div>
        {review.summary && (
          <p className="whitespace-pre-wrap text-sm">{review.summary}</p>
        )}
        {review.what_worked && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              What already works:{" "}
            </span>
            {review.what_worked}
          </p>
        )}
      </div>
    </div>
  );
}

export function ReviewerChat({
  review,
  guidedFinding,
  onClearGuidedFinding,
  onResolved,
  onRunReview,
  reviewRunning,
  pendingExamples,
}: {
  /** The review whose thread is open. Null when no review exists yet. */
  review: Review | null;
  /** Set when the user clicked "Guide" on a finding — scopes the next message. */
  guidedFinding: Finding | null;
  onClearGuidedFinding: () => void;
  /** Guidance changes the FINDINGS — the host refetches the enrollment. */
  onResolved: () => void;
  onRunReview: () => void;
  reviewRunning: boolean;
  pendingExamples: number;
}) {
  const [draft, setDraft] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  // State, not a ref: the elapsed bubble reads it during render.
  const [sendStartedAt, setSendStartedAt] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(scrollRef, { label: "hindsight reviewer chat" });

  const reviewId = review?.id ?? null;
  const thread = useQuery({
    queryKey: ["hindsight", "thread", reviewId],
    queryFn: () => getReviewThread(reviewId as string),
    enabled: Boolean(reviewId),
  });

  const messages = thread.data?.messages ?? [];
  const unavailable = Boolean(thread.data && !thread.data.available);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, reviewId]);

  const send = useMutation({
    mutationFn: (message: string) => {
      setSendStartedAt(Date.now());
      return guidedFinding
        ? discussFinding(guidedFinding.id, message)
        : discussReview(reviewId as string, message);
    },
    onSuccess: (result) => {
      if (result.status === "failed") {
        // A failure is a normal outcome to RENDER — the human's words stay in
        // the composer so nothing they wrote is lost.
        setFailure(result.reason ?? "The reviewer could not answer that.");
        return;
      }
      setFailure(null);
      setDraft("");
      onClearGuidedFinding();
      toast.success(
        result.findings_created
          ? `The reviewer answered and added ${result.findings_created} new proposal${result.findings_created === 1 ? "" : "s"} — ${fmtCost(result.cost_usd)}`
          : `The reviewer answered — no new proposals, ${fmtCost(result.cost_usd)}`,
      );
      void thread.refetch();
      onResolved();
    },
    onError: (err: Error) => setFailure(`Could not send: ${err.message}`),
  });

  if (!review) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">No review to talk about yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {pendingExamples > 0
              ? `${pendingExamples} real ${pendingExamples === 1 ? "run is" : "runs are"} waiting. Run the first review and the reviewer's conclusions land here — then you can tell it what it got right or wrong.`
              : "Once this agent has real conversations, the reviewer reads them and its conclusions land here — then you can tell it what it got right or wrong."}
          </p>
        </div>
        <Button
          size="sm"
          disabled={reviewRunning || pendingExamples === 0}
          onClick={onRunReview}
        >
          {reviewRunning ? (
            <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="mr-1 h-3.5 w-3.5" />
          )}
          {reviewRunning ? "Reviewing…" : "Run the first review"}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="hindsight-reviewer-chat"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
      >
        <ReviewIntro review={review} />

        {thread.isLoading && <Skeleton className="h-24" />}

        {unavailable && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {thread.data?.reason ??
              "This review has no reviewer thread to reply to yet. Run a new review to start one."}
          </div>
        )}

        {messages.map((m) => (
          <ThreadMessageRow key={m.id} message={m} variant="chat" />
        ))}

        {send.isPending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                The reviewer is reading your guidance —{" "}
                <Elapsed startedAt={sendStartedAt} /> elapsed
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                It re-reads the thread and the real transcripts before
                answering, which normally takes about a minute. New proposals
                appear on the right when it finishes.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        {failure && !send.isPending && (
          <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
            {failure} Your message is still below — edit it and try again.
          </div>
        )}

        {guidedFinding && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              Guiding the reviewer on: <strong>{guidedFinding.title}</strong>
            </span>
            <button
              type="button"
              className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              title="Talk about the whole review instead"
              onClick={onClearGuidedFinding}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <Textarea
          className="text-base md:text-sm"
          rows={3}
          value={draft}
          disabled={send.isPending || unavailable}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            guidedFinding
              ? "e.g. “This is close, but here is the real problem and what actually needs to happen…”"
              : "Tell the reviewer what it got right, what it missed, or what actually matters…"
          }
          data-testid="hindsight-chat-input"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {unavailable
              ? "Run a new review to start a thread you can reply to."
              : "Your guidance usually produces new proposals rather than edits. Takes about a minute; you can leave this page."}
          </span>
          <Button
            size="sm"
            disabled={!draft.trim() || send.isPending || unavailable}
            onClick={() => send.mutate(draft.trim())}
            data-testid="hindsight-chat-send"
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            {send.isPending ? "Sending…" : "Send guidance"}
          </Button>
        </div>
      </div>
    </div>
  );
}
