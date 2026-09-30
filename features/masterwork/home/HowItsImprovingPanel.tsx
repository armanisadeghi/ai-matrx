"use client";

// features/masterwork/home/HowItsImprovingPanel.tsx
//
// "How it's improving" — the Expert-facing view of the review loop behind
// Masterwork. The five agents that do the work here are enrolled in the
// platform's review system (Hindsight): their real transcripts are read on a
// cadence, and improvements found in review are applied as new revisions.
//
// HONESTY CONTRACT: the review rows themselves (hindsight.*) are not readable
// from the browser. The panel's numbers come from the ONE sanctioned window —
// the `masterwork_improvement_summary` SECURITY DEFINER RPC, which returns
// DE-IDENTIFIED aggregates only (review counts, last-review time, per-lever
// theme counts) — plus the public mandate registry and each agent's revision
// count (agent.definition). It NEVER fabricates review activity.

import { useEffect, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import {
  fetchImprovementRows,
  type ImprovementRow,
} from "./service";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * AN OPTION-BINDING WRAPPER over `@ai-matrx/kit/format`. The body it replaces
 * rounded an epoch delta into whole days and returned "today" for anything at
 * or below zero, so an improvement stamped a few seconds ahead of the viewer's
 * clock read "today" and one stamped tomorrow read "today" too. kit's `long`
 * voice speaks both directions, has a sub-minute skew band, and falls back to
 * the absolute date past a year — which is what the `toLocaleDateString` branch
 * was reaching for.
 */
function whenDate(iso: string): string {
  return formatRelativeTime(iso, { style: "long" });
}

export function HowItsImprovingPanel() {
  const [rows, setRows] = useState<ImprovementRow[] | null>(null);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchImprovementRows()
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setReviewsError(r.reviewsError);
      })
      .catch((err: unknown) => {
        console.error("[masterwork-home] improvement panel read failed", err);
        if (!cancelled)
          setFailed(
            err instanceof Error
              ? err.message
              : "Could not load how Masterwork is improving.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading and failed states render the panel's frame with the truth, never
  // a silent gap: a missing panel reads as "there is nothing to show".
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <ChartNoAxesCombined className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          How it&apos;s improving
        </h2>
      </div>
      {failed !== null ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-destructive">
            Couldn&apos;t load this panel: {failed}{" "}
            <ErrorAlchemyMenu error={failed} />
          </p>
        </div>
      ) : rows === null ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-6">
          <LoadingSpinner />
        </div>
      ) : (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Five specialists do the work behind Masterwork — and each one is
          under standing review: its real sessions are re-read on a schedule,
          and when a review finds a better way, the specialist is revised. Your
          feedback in the Studio feeds those reviews.
        </p>
        {reviewsError !== null ? (
          <p className="mt-2 text-xs text-destructive">
            Review history couldn&apos;t be loaded, so review counts are
            missing below: {reviewsError}{" "}
            <ErrorAlchemyMenu error={reviewsError} />
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.mandateKey}
              className="rounded-md border border-border bg-background p-3"
            >
              <div className="text-sm font-medium text-foreground">
                {row.label}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{row.job}</p>
              {row.reviewCount > 0 ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {row.reviewCount}{" "}
                  {row.reviewCount === 1 ? "review" : "reviews"} of its real
                  sessions
                  {row.lastReviewAt
                    ? ` — last ${whenDate(row.lastReviewAt)}`
                    : ""}
                  {row.findingsTotal > 0
                    ? `. ${row.findingsTotal} ${
                        row.findingsTotal === 1
                          ? "improvement found"
                          : "improvements found"
                      }${
                        row.findingsApplied > 0
                          ? `, ${row.findingsApplied} applied`
                          : ""
                      }${
                        row.findingsOpen > 0
                          ? `, ${row.findingsOpen} awaiting a decision`
                          : ""
                      }.`
                    : ". Nothing needed changing."}
                </p>
              ) : row.enrolled ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Enrolled — its first review runs as real sessions accumulate
                </p>
              ) : null}
              {row.agentVersion !== null && row.updatedAt !== null ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {/* version 1 is the original — revisions are the versions after it */}
                  {row.agentVersion > 1
                    ? `Revised ${row.agentVersion - 1} ${
                        row.agentVersion - 1 === 1 ? "time" : "times"
                      } — last ${whenDate(row.updatedAt)}${
                        row.lastChangeBySystem ? ", from a review" : ""
                      }`
                    : "Not revised yet"}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      )}
    </section>
  );
}
