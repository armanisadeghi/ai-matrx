"use client";

/**
 * Triage mode — the unvalued queue as a one-at-a-time ruling session,
 * highest-traffic first (the keywords costing the most clarity get ruled
 * first). One keyword, its evidence, the site's tier choices, a note, done —
 * next. Skipping is honest: an expert may not know yet, and Unvalued is a
 * first-class answer.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, Gavel, Loader2, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import type { ValueBandDef, ValueReviewRow } from "../../types";
import { NEGATIVE, UNVALUED, bandColorClasses, compact } from "./lib";
import type { RulingInput } from "./useLedgerData";

export function TriageMode({
  rows,
  totalUnvalued,
  isLoading,
  isFetching,
  error,
  onRetry,
  vocab,
  onRule,
  rulingPending,
  onExit,
}: {
  rows: ValueReviewRow[] | undefined;
  totalUnvalued: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRetry: () => void;
  vocab: ValueBandDef[];
  onRule: (input: RulingInput) => void;
  rulingPending: boolean;
  onExit: () => void;
}) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [ruledCount, setRuledCount] = useState(0);
  const [notes, setNotes] = useState("");

  const queue = useMemo(
    () => (rows ?? []).filter((r) => !skipped.has(r.keyword_id)),
    [rows, skipped],
  );
  const current = queue[0];
  const remaining = Math.max(totalUnvalued - ruledCount, 0);

  const choices = vocab.filter((b) => b.value !== UNVALUED);
  const hasNegative = choices.some((b) => b.value === NEGATIVE);

  const issue = (tier: string, tierLabel: string) => {
    if (!current) return;
    onRule({
      keywordIds: [current.keyword_id],
      tier,
      tierLabel,
      notes: notes.trim() || undefined,
    });
    setRuledCount((n) => n + 1);
    setNotes("");
  };

  return (
    <section
      aria-label="Ruling session"
      className="mx-auto w-full max-w-2xl"
    >
      {/* Session header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Ruling session</h2>
          <p className="text-sm text-muted-foreground">
            {ruledCount > 0 && (
              <span className="font-medium text-success">{ruledCount} ruled · </span>
            )}
            {remaining.toLocaleString()} keyword{remaining === 1 ? "" : "s"} still
            unvalued — biggest traffic first
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onExit}>
          <X className="h-3.5 w-3.5" />
          Done for now
        </Button>
      </div>

      {/* Progress rail */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${Math.min((ruledCount / Math.max(ruledCount + remaining, 1)) * 100, 100)}%`,
          }}
        />
      </div>

      <div className="mt-4">
        {isLoading ? (
          <CardLoading />
        ) : error ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-destructive">
              The unvalued queue could not be loaded.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : !current ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            <p className="mt-3 text-base font-semibold text-foreground">
              {totalUnvalued === 0
                ? "Every keyword has a value — the queue is empty."
                : skipped.size > 0
                  ? "You've seen this batch — the rest were skipped."
                  : "This batch is done."}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {skipped.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSkipped(new Set())}
                >
                  Revisit the {skipped.size} skipped
                </Button>
              )}
              <Button size="sm" onClick={onExit}>
                Back to the ledger
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6 ${
              rulingPending || isFetching ? "opacity-70" : ""
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              People found this site by searching
            </p>
            <p className="mt-1.5 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
              “{current.keyword}”
            </p>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span title="Clicks this keyword sent to the site in the last 28 days">
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {compact(current.clicks)}
                </span>{" "}
                clicks
              </span>
              <span title="How often the site appeared in results for this search">
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {compact(current.impressions)}
                </span>{" "}
                appearances
              </span>
              {current.traffic_class && (
                <span title="Traffic class — what kind of search this is (separate from worth)">
                  reads as{" "}
                  <span className="font-medium text-foreground">
                    {current.traffic_class}
                  </span>
                </span>
              )}
            </div>

            <p className="mt-4 border-t border-dashed border-border pt-4 text-sm text-muted-foreground">
              Nothing you&apos;ve defined applies to this keyword yet. If someone
              searched this, how much is that visit worth to this business?
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {choices.map((b) => {
                const color = bandColorClasses(b.value, vocab);
                return (
                  <button
                    key={b.value}
                    type="button"
                    disabled={rulingPending}
                    title={b.description ?? undefined}
                    onClick={() => issue(b.value, b.label)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all hover:scale-[1.02] hover:border-primary/50 disabled:opacity-50 ${color.chip}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${color.swatch}`} />
                    {b.label}
                  </button>
                );
              })}
              {!hasNegative && (
                <button
                  type="button"
                  disabled={rulingPending}
                  onClick={() => issue(NEGATIVE, "Negative")}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm font-medium text-destructive transition-all hover:scale-[1.02] hover:border-destructive/60 disabled:opacity-50"
                >
                  <span className="h-2 w-2 rounded-full bg-destructive/70" />
                  Negative — we don&apos;t want this traffic
                </button>
              )}
            </div>

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why? (optional — your reasoning travels with the ruling)"
              className="mt-3 min-h-[56px] resize-none text-sm"
            />

            <div className="mt-3 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                disabled={rulingPending}
                onClick={() => {
                  setSkipped((prev) => new Set(prev).add(current.keyword_id));
                  setNotes("");
                }}
              >
                <SkipForward className="h-3.5 w-3.5" />
                Not sure — skip
              </Button>
              {(rulingPending || isFetching) && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {rulingPending ? "Recording your ruling…" : "Fetching the next…"}
                </span>
              )}
              {!rulingPending && !isFetching && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Gavel className="h-3 w-3" />
                  One tap rules it — next appears automatically
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
