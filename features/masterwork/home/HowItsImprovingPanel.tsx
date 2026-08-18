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
import { Sparkles } from "lucide-react";
import {
  fetchImprovementRows,
  type ImprovementRow,
} from "./service";

function whenDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function HowItsImprovingPanel() {
  const [rows, setRows] = useState<ImprovementRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchImprovementRows()
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((err: unknown) => {
        console.error("[masterwork-home] improvement panel read failed", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null; // Enrichment — never blanks the page; the error screamed.
  if (rows === null) return null; // Renders when it truly has data.

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          How it&apos;s improving
        </h2>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Five specialists do the work behind Masterwork — and each one is
          under standing review: its real sessions are re-read on a schedule,
          and when a review finds a better way, the specialist is revised. Your
          feedback in the Studio feeds those reviews.
        </p>
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
                  Revised {row.agentVersion}{" "}
                  {row.agentVersion === 1 ? "time" : "times"} — last{" "}
                  {whenDate(row.updatedAt)}
                  {row.lastChangeBySystem ? ", from a review" : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
