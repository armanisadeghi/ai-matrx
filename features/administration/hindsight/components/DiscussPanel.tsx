"use client";

/**
 * DiscussPanel — talk to the reviewer that produced these findings.
 *
 * Apply / Reject is not enough. When the reviewer noticed the small things and
 * MISSED the big one, the human has to be able to say so — and have the
 * reviewer come back with better recommendations. This is that third path.
 *
 * Two things shape this UI and are easy to get wrong:
 *
 *   1. **A reply usually produces NEW findings, not an edit to the one in
 *      front of you.** Never present this as "editing this recommendation";
 *      say plainly that new findings may appear, and refetch the whole review
 *      when a reply resolves.
 *   2. **It takes about a minute** (a frontier model reads the thread). Show
 *      elapsed time, and if it fails, KEEP the typed message — losing a
 *      carefully written paragraph to a transient failure is unforgivable.
 *
 * Message bodies render through the canonical markdown pipeline
 * (`MarkdownStream` in persisted mode). This is not a stream and must never
 * become a bespoke renderer.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import MarkdownStream from "@/components/MarkdownStream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { discussFinding, discussReview, getReviewThread } from "../api";
import type { DiscussResult, ThreadMessage } from "../types";
import { fmtCost, fmtDate, fmtElapsed } from "./tokens";

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

function ThreadMessageRow({ message }: { message: ThreadMessage }) {
  const isHuman = message.role === "user";
  return (
    <div
      className={cn(
        "rounded-md border p-2",
        isHuman
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-muted/30",
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase">
          {isHuman ? "you" : message.role}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {fmtDate(message.created_at)}
        </span>
      </div>
      <div className="text-sm">
        <MarkdownStream
          content={message.text ?? ""}
          isStreamActive={false}
          hideCopyButton
        />
      </div>
    </div>
  );
}

/**
 * The reviewer answers with its STRUCTURED output, so `reply` is usually a raw
 * JSON object, not prose. The findings it produced are the human-facing result
 * and already render in the list above; dumping the JSON blob as the headline
 * would bury that. Prose replies render normally; a JSON reply collapses to an
 * inspectable block. (Backend follow-up: have `discuss` return the reviewer's
 * sentence separately from its structured payload.)
 */
function ReviewerReply({ reply }: { reply: string }) {
  const [open, setOpen] = useState(false);
  const looksStructured = reply.trimStart().startsWith("{");

  if (!looksStructured) {
    return (
      <div className="mt-1 text-sm">
        <MarkdownStream content={reply} isStreamActive={false} hideCopyButton />
      </div>
    );
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        {open ? "Hide" : "Show"} the reviewer&apos;s raw structured answer
      </button>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-[11px]">
          {reply}
        </pre>
      )}
    </div>
  );
}

export function DiscussPanel({
  reviewId,
  findingId,
  findingTitle,
  onResolved,
}: {
  reviewId: string;
  /** Present when the conversation is scoped to one finding. */
  findingId?: string;
  findingTitle?: string;
  /** Refetch the review — guidance changes the FINDINGS, not just the thread. */
  onResolved: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [lastResult, setLastResult] = useState<DiscussResult | null>(null);
  const startedAt = useRef(0);

  const thread = useQuery({
    queryKey: ["hindsight", "thread", reviewId],
    queryFn: () => getReviewThread(reviewId),
  });

  const send = useMutation({
    mutationFn: (message: string) => {
      startedAt.current = Date.now();
      return findingId
        ? discussFinding(findingId, message)
        : discussReview(reviewId, message);
    },
    onSuccess: (result) => {
      setLastResult(result);
      if (result.status === "failed") {
        // A failure is a normal outcome to RENDER — and the human's words stay
        // in the box so nothing they wrote is lost.
        toast.error(result.reason ?? "The reviewer could not answer that.");
        return;
      }
      setDraft("");
      toast.success(
        result.findings_created
          ? `The reviewer answered and added ${result.findings_created} new finding(s) — ${fmtCost(result.cost_usd)}`
          : `The reviewer answered — no new findings, ${fmtCost(result.cost_usd)}`,
      );
      void thread.refetch();
      onResolved();
    },
    onError: (err: Error) => toast.error(`Could not send: ${err.message}`),
  });

  const messages = thread.data?.messages ?? [];
  const unavailable = thread.data && !thread.data.available;

  return (
    <Card className="space-y-3 p-3" data-testid="hindsight-discuss">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {findingId ? "Guide the reviewer on this finding" : "Talk to the reviewer"}
        </span>
        {findingTitle && (
          <span className="truncate text-xs text-muted-foreground">
            re: {findingTitle}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Tell it what it missed or what actually matters. A reply usually adds{" "}
        <strong>new findings</strong> rather than editing this one — the whole
        point is that your guidance changes the recommendations.
      </p>

      {thread.isLoading && <Skeleton className="h-24" />}

      {unavailable && (
        <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          {thread.data?.reason ??
            "This review has no reviewer thread to reply to yet."}
        </div>
      )}

      {messages.length > 0 && (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {messages.map((m) => (
            <ThreadMessageRow key={m.id} message={m} />
          ))}
        </div>
      )}

      {send.isPending && (
        <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
          <span className="inline-flex items-center gap-2 font-medium">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            The reviewer is reading your guidance — <Elapsed startedAt={startedAt.current} />{" "}
            elapsed
          </span>
          <p className="mt-1 text-muted-foreground">
            It re-reads the thread and the real transcripts before answering,
            which normally takes about a minute.
          </p>
        </div>
      )}

      {lastResult?.status === "failed" && !send.isPending && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          {lastResult.reason ?? "The reviewer could not answer that."} Your
          message is still below — edit it and try again.
        </div>
      )}

      {lastResult && lastResult.status !== "failed" && (
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <div className="text-sm font-medium">
            {(lastResult.findings_created ?? 0) > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                The reviewer answered and added {lastResult.findings_created} new
                finding{lastResult.findings_created === 1 ? "" : "s"} — they are in
                the list above.
              </span>
            ) : (
              "The reviewer answered without proposing anything new."
            )}
          </div>
          {lastResult.reply && (
            <ReviewerReply reply={lastResult.reply} />
          )}
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          rows={3}
          value={draft}
          disabled={send.isPending}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            findingId
              ? "e.g. “This is close, but the real problem is that we have no scrapable model-list URL per provider. Find some, test them with our scraper, and put the working ones in the system prompt.”"
              : "e.g. “You caught the small things and missed the big one — here is what actually needs to happen…”"
          }
          data-testid="hindsight-discuss-input"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {unavailable
              ? "Run a new review on this enrollment to start a thread you can reply to."
              : "Takes about a minute. You can leave this page — the answer lands on the review."}
          </span>
          <Button
            size="sm"
            disabled={!draft.trim() || send.isPending || Boolean(unavailable)}
            onClick={() => send.mutate(draft.trim())}
            data-testid="hindsight-discuss-send"
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            {send.isPending ? "Sending…" : "Send guidance"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
