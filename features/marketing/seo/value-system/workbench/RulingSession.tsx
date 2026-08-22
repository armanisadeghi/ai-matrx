"use client";

/**
 * THE RULING SESSION — grafted from variant B's "triage mode" (the ui-reimagine
 * seat, 2026-08-21) when the bake-off converged on 2026-08-22.
 *
 * The table is the right shape for reviewing what the arithmetic already
 * decided. It is the wrong shape for the pile it cannot decide: thousands of
 * keywords with no meaning attached, where the only useful motion is one
 * question, one answer, next. So the unvalued queue gets its own posture —
 * Superhuman's one-at-a-time triage — biggest traffic first, because the
 * keywords costing the most clarity are worth ruling first.
 *
 * Skipping is honest and first-class: an expert may genuinely not know yet,
 * and Unvalued is a real answer, never a guessed middle tier.
 *
 * It writes through the SAME mutation the table uses (`setKeywordValue`, ONE
 * write path) — this component owns no data access of its own.
 */

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Gavel, Loader2, SkipForward, X } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { getValueReview } from "../data";
import type { ValueReviewRow } from "../types";
import { humanizeSlug, type BandMeta, type ValueWindow } from "../lib";

/** How many of the queue we hold at once. Refetched as rulings land. */
const BATCH = 25;

export interface SessionRuling {
  keywordIds: string[];
  tier: string;
  notes?: string;
  label: string;
}

export function RulingSession({
  siteId,
  window,
  metas,
  totalUnvalued,
  onRule,
  rulingPending,
  onExit,
}: {
  siteId: string;
  window: ValueWindow;
  metas: BandMeta[];
  /** From the decomposition — the true size of the pile, not just this batch. */
  totalUnvalued: number;
  onRule: (input: SessionRuling) => void;
  rulingPending: boolean;
  onExit: () => void;
}) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [ruledCount, setRuledCount] = useState(0);
  const [notes, setNotes] = useState("");

  const queue = useQuery({
    queryKey: [
      "marketing",
      "value",
      "review",
      siteId,
      window.start,
      window.end,
      "ruling-session",
    ],
    queryFn: ({ signal }) =>
      getValueReview(
        siteId,
        window.start,
        window.end,
        { source: "unvalued", sort: "clicks", sortDir: "desc", limit: BATCH },
        signal,
      ),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const rows: ValueReviewRow[] = queue.data?.rows ?? [];
  const pending = rows.filter((row) => !skipped.has(row.keyword_id));
  const current = pending[0];
  const remaining = Math.max((queue.data?.total ?? totalUnvalued) - ruledCount, 0);

  // Unvalued is where a keyword LANDS, never something a human rules it INTO.
  const choices = metas.filter((meta) => meta.reserved !== "unvalued");

  const issue = (tier: string) => {
    if (!current) return;
    onRule({
      keywordIds: [current.keyword_id],
      tier,
      notes: notes.trim() || undefined,
      label: current.keyword,
    });
    setRuledCount((count) => count + 1);
    setNotes("");
  };

  return (
    <section
      aria-label="Ruling session"
      className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Ruling session
          </h2>
          <p className="text-xs text-muted-foreground">
            {ruledCount > 0 ? (
              <span className="font-medium text-success">
                {ruledCount} ruled ·{" "}
              </span>
            ) : null}
            {formatCount(remaining)} keyword{remaining === 1 ? "" : "s"} still
            unvalued — biggest traffic first
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onExit}
        >
          <X className="h-3.5 w-3.5" />
          Done for now
        </Button>
      </div>

      <div className="mt-2.5 h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${Math.min(
              (ruledCount / Math.max(ruledCount + remaining, 1)) * 100,
              100,
            )}%`,
          }}
        />
      </div>

      <div className="mt-3">
        {queue.isPending ? (
          <CardLoading />
        ) : queue.isError ? (
          <InlineQueryError
            what="the unvalued queue"
            error={queue.error}
            onRetry={() => void queue.refetch()}
          />
        ) : !current ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-success" />
            <p className="mt-2.5 text-sm font-semibold text-foreground">
              {remaining === 0
                ? "Every keyword carries a value — the queue is empty."
                : skipped.size > 0
                  ? "You've seen this batch — the rest were skipped."
                  : "This batch is done."}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {skipped.size > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSkipped(new Set())}
                >
                  Revisit the {skipped.size} skipped
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={onExit}
              >
                Back to the workbench
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5",
              (rulingPending || queue.isFetching) && "opacity-70",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              People found this site by searching
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug text-foreground sm:text-xl">
              &ldquo;{current.keyword}&rdquo;
            </p>

            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span title="Clicks this keyword sent to the site in this window">
                <span className="font-medium tabular-nums text-foreground">
                  {formatCount(current.clicks)}
                </span>{" "}
                clicks
              </span>
              <span title="How often the site appeared in results for this search">
                <span className="font-medium tabular-nums text-foreground">
                  {formatCount(current.impressions)}
                </span>{" "}
                appearances
              </span>
              {current.traffic_class ? (
                <span title="Traffic class — what kind of search this is, which is a separate question from what it is worth">
                  reads as{" "}
                  <span className="font-medium text-foreground">
                    {humanizeSlug(current.traffic_class)}
                  </span>
                </span>
              ) : null}
            </div>

            <p className="mt-3 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
              Nothing you have defined applies to this keyword yet. If someone
              searched this, how much is that visit worth to this business?
            </p>

            <div className="mt-2.5 flex flex-wrap gap-2">
              {choices.map((meta) => (
                <button
                  key={meta.value}
                  type="button"
                  disabled={rulingPending}
                  title={meta.description ?? undefined}
                  onClick={() => issue(meta.value)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:brightness-110 disabled:opacity-50",
                    meta.chip,
                  )}
                >
                  {meta.label}
                </button>
              ))}
            </div>

            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Why? (optional — your reasoning travels with the ruling)"
              className="mt-2.5 min-h-[56px] resize-none text-sm"
            />

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                disabled={rulingPending}
                onClick={() => {
                  setSkipped((previous) =>
                    new Set(previous).add(current.keyword_id),
                  );
                  setNotes("");
                }}
              >
                <SkipForward className="h-3.5 w-3.5" />
                Not sure — skip
              </Button>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {rulingPending || queue.isFetching ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {rulingPending
                      ? "Recording your ruling…"
                      : "Fetching the next…"}
                  </>
                ) : (
                  <>
                    <Gavel className="h-3 w-3" />
                    One tap rules it — the next appears automatically
                  </>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
