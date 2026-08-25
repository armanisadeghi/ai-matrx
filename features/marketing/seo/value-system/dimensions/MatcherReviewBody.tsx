"use client";

/**
 * WHAT THAT MATCH ACTUALLY DID — the review table.
 *
 * ARMAN'S RULING (2026-08-24): *"instead of just giving a count in a toast, you
 * need to get a nice, beautiful, big UI… a table that shows you all the
 * keywords that match, and use colors to show ones that already have matched
 * other qualifiers so you can understand if you have overlap… and give you a
 * way to undo, [and] a way of fixing the things that you've just done by
 * immediately giving you the ones that you just matched."*
 *
 * WHY A COUNT WAS NEVER ENOUGH. On Data Destruction the `e-stewards` match
 * reads "19 keywords" — and catches 27. The other eight are held by a rival
 * answer on the same single-answer dimension, so the rule fired and changed
 * nothing on them. No number in a toast can show that; a row that says LOST
 * and names the winner can.
 *
 * REFERENCE PRODUCT: GitHub's pull-request Files-changed table crossed with
 * Linear's issue list — a dense scannable list where the LEFT edge carries a
 * status colour you read without reading, the middle carries the thing itself,
 * and the right carries the numbers you sort by. Borrowed because the job is
 * identical: judge many rows fast, then act on the ones that are wrong.
 *
 * COLOUR CARRIES OUTCOME, NEVER DECORATION. Four states, four edges: held is
 * the accent, lost is a warning, blocked is neutral-locked, unstamped is
 * muted. A row's colour is a claim about what happened to it — so nothing else
 * on the row is allowed to be coloured.
 *
 * UNDO IS THE MATCH'S OWN DELETE. It is not a separate journal or a snapshot:
 * deleting the matcher removes it AND every answer it alone was keeping, in one
 * server transaction (`seo.dimension_matcher_delete`). That is why undo here is
 * honest — the thing it reverses is the thing it deletes.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Lock,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import {
  deleteDimensionMatcher,
  getMatcherReview,
  type MatcherReviewRow,
} from "./data";

type Outcome = MatcherReviewRow["outcome"];

const OUTCOME: Record<
  Outcome,
  { label: string; blurb: string; edge: string; chip: string; icon: typeof Check }
> = {
  held: {
    label: "Applied",
    blurb: "your answer is the one on this keyword",
    edge: "border-l-primary",
    chip: "border-primary/40 bg-primary/10 text-primary",
    icon: Check,
  },
  lost: {
    label: "Overruled",
    blurb:
      "it matches, but another answer on this same dimension holds the keyword — only one is allowed, and it is not yours",
    edge: "border-l-warning",
    chip: "border-warning/50 bg-warning/10 text-warning",
    icon: AlertTriangle,
  },
  blocked: {
    label: "Your own ruling",
    blurb:
      "a person set this answer by hand, and a match never overwrites a person",
    edge: "border-l-muted-foreground/50",
    chip: "border-border bg-muted text-muted-foreground",
    icon: Lock,
  },
  unstamped: {
    label: "Not applied yet",
    blurb: "it matches and nothing holds the dimension — run the matches again",
    edge: "border-l-border",
    chip: "border-border text-muted-foreground",
    icon: RefreshCw,
  },
};

const FILTERS: { key: Outcome | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "held", label: "Applied" },
  { key: "lost", label: "Overruled" },
  { key: "blocked", label: "Your rulings" },
  { key: "unstamped", label: "Not applied" },
];

function TableSkeleton() {
  return (
    <div className="space-y-1.5 p-3" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div
          key={row}
          className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

export function MatcherReviewBody({
  siteId,
  matcherId,
  pattern,
  kindLabel,
  valueLabel,
  dimensionLabel,
  onGone,
}: {
  siteId: string;
  matcherId: string;
  /** What the match looks for — shown so the window stands alone. */
  pattern: string | null;
  kindLabel: string;
  valueLabel: string;
  dimensionLabel: string;
  /** The match was deleted from in here — the opener closes the window. */
  onGone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Outcome | "all">("all");
  const [needle, setNeedle] = useState("");

  const reviewKey = ["marketing", "seo", "matcher-review", siteId, matcherId];
  const review = useQuery({
    queryKey: reviewKey,
    queryFn: ({ signal }) => getMatcherReview(siteId, matcherId, 300, signal),
    staleTime: 15_000,
  });

  const undo = useMutation({
    mutationFn: () => deleteDimensionMatcher(matcherId),
    onSuccess: (result) => {
      toast.success("Match undone", {
        description:
          result.answersRemoved > 0
            ? `Took “${valueLabel}” back off ${formatCount(result.answersRemoved)} keyword${
                result.answersRemoved === 1 ? "" : "s"
              }${
                result.answersRestamped > 0
                  ? `, and ${formatCount(result.answersRestamped)} of them picked up the answer that was waiting behind it`
                  : ""
              }.`
            : "It had not stamped anything.",
      });
      // Facets feed the value resolver — every keyword surface's numbers moved.
      void queryClient.invalidateQueries({ queryKey: ["marketing", "seo"] });
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
      onGone?.();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const askAndUndo = async () => {
    const applied = counts.held;
    const ok = await confirm({
      title: "Undo this match?",
      description:
        applied > 0
          ? `This deletes the match and takes “${valueLabel}” back off the ${formatCount(applied)} keyword${
              applied === 1 ? "" : "s"
            } it is holding — in one step. Any keyword another match was waiting to claim picks that answer up immediately.`
          : "This deletes the match. It is not currently holding any keyword, so nothing else changes.",
      variant: "destructive",
      confirmLabel: "Undo it",
    });
    if (ok) undo.mutate();
  };

  const rows = review.data?.rows ?? [];
  const counts = {
    held: rows.filter((row) => row.outcome === "held").length,
    lost: rows.filter((row) => row.outcome === "lost").length,
    blocked: rows.filter((row) => row.outcome === "blocked").length,
    unstamped: rows.filter((row) => row.outcome === "unstamped").length,
  };
  const trimmed = needle.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      (filter === "all" || row.outcome === filter) &&
      (trimmed === "" || row.phrase.toLowerCase().includes(trimmed)),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-foreground">
            {dimensionLabel}
            <span className="mx-1.5 text-muted-foreground opacity-60">›</span>
            {valueLabel}
          </p>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {kindLabel}
          </span>
          {pattern ? (
            <span className="min-w-0 break-all font-mono text-[11px] text-foreground">
              “{pattern}”
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
            disabled={undo.isPending || review.isPending}
            onClick={() => void askAndUndo()}
          >
            {undo.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )}
            Undo this match
          </Button>
        </div>

        {review.data ? (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Catches{" "}
            <span className="font-medium text-foreground">
              {formatCount(review.data.totalMatches)}
            </span>{" "}
            keyword{review.data.totalMatches === 1 ? "" : "s"} on this site.
            {counts.lost > 0 ? (
              <>
                {" "}
                <span className="text-warning">
                  {formatCount(counts.lost)} of them already belong to another
                  answer
                </span>{" "}
                — this dimension allows one answer per keyword, so on those the
                match changes nothing.
              </>
            ) : null}
            {review.data.totalMatches > rows.length ? (
              <>
                {" "}
                Showing the {formatCount(rows.length)} with the most traffic.
              </>
            ) : null}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((entry) => {
            const n =
              entry.key === "all"
                ? rows.length
                : counts[entry.key as keyof typeof counts];
            if (entry.key !== "all" && n === 0) return null;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFilter(entry.key)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                  filter === entry.key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {entry.label}{" "}
                <span className="tabular-nums opacity-70">{formatCount(n)}</span>
              </button>
            );
          })}
          <div className="relative ml-auto min-w-0 flex-1 sm:max-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={needle}
              onChange={(event) => setNeedle(event.target.value)}
              placeholder="Filter these keywords…"
              aria-label="Filter the matched keywords"
              className="h-7 pl-8 text-xs"
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
        {review.isPending ? <TableSkeleton /> : null}

        {review.isError ? (
          <div className="p-3">
            <InlineQueryError
              what="what this match caught"
              error={review.error}
              onRetry={() => void review.refetch()}
            />
          </div>
        ) : null}

        {review.data && rows.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-semibold text-foreground">
              This match catches nothing
            </p>
            <p className="mx-auto mt-1 max-w-md text-[11px] leading-4 text-muted-foreground">
              No keyword on this site contains what it looks for. Either the
              wording is not how people search, or these keywords have not been
              collected yet — a match that catches nothing is not a mistake, but
              it is also not doing anything.
            </p>
          </div>
        ) : null}

        {review.data && rows.length > 0 && shown.length === 0 ? (
          <p className="p-6 text-center text-[11px] text-muted-foreground">
            No matched keyword fits that filter.
          </p>
        ) : null}

        <ul className="divide-y divide-border">
          {shown.map((row) => {
            const meta = OUTCOME[row.outcome];
            const Icon = meta.icon;
            return (
              <li
                key={row.keywordId}
                className={cn(
                  "flex flex-wrap items-start gap-x-3 gap-y-1 border-l-2 px-3 py-2",
                  meta.edge,
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs font-medium text-foreground">
                    {row.phrase}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      title={meta.blurb}
                      className={cn(
                        "inline-flex items-center gap-1 rounded border px-1 py-px text-[10px]",
                        meta.chip,
                      )}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {meta.label}
                    </span>
                    {row.outcome !== "held" && row.holdingValue ? (
                      <span className="text-[10px] text-muted-foreground">
                        holds{" "}
                        <span className="text-foreground">
                          {row.holdingValue}
                        </span>
                        {row.holdingSource ? ` (${row.holdingSource})` : null}
                      </span>
                    ) : null}
                    {row.rivals.length > 0 ? (
                      <span
                        className="text-[10px] text-muted-foreground"
                        title="Other answers on this same dimension whose matches also catch this keyword. Only one can apply."
                      >
                        also matched by{" "}
                        <span className="text-foreground">
                          {row.rivals.join(", ")}
                        </span>
                      </span>
                    ) : null}
                    {/* Other dimensions are CONTEXT, never a verdict — they are
                        deliberately colourless so the outcome edge stays the
                        only thing colour is claiming anything about. */}
                    {row.otherAnswers.slice(0, 4).map((answer) => (
                      <span
                        key={`${answer.dimension}:${answer.value}`}
                        className="rounded border border-border px-1 py-px text-[10px] text-muted-foreground"
                        title={`${answer.dimension}${answer.source ? ` · set by ${answer.source}` : ""}`}
                      >
                        {answer.value}
                      </span>
                    ))}
                    {row.otherAnswers.length > 4 ? (
                      <span className="text-[10px] text-muted-foreground">
                        +{row.otherAnswers.length - 4} more
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-baseline gap-3 text-[11px] tabular-nums">
                  <span
                    className="text-foreground"
                    title="Clicks in the last 90 days"
                  >
                    {formatCount(row.clicks)}
                    <span className="ml-1 text-muted-foreground">clicks</span>
                  </span>
                  <span
                    className="text-muted-foreground"
                    title="Impressions in the last 90 days"
                  >
                    {formatCount(row.impressions)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="shrink-0 border-t border-border px-3 py-2">
        <p className="text-[10px] leading-4 text-muted-foreground">
          Traffic is this site's last 90 days. “Overruled” rows are not a
          failure of your wording — this dimension allows one answer per
          keyword, so the other answer simply got there. Delete the answer that
          should not win, or narrow this match.
        </p>
      </footer>
    </div>
  );
}
