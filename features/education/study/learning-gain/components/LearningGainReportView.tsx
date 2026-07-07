"use client";

// features/education/study/learning-gain/components/LearningGainReportView.tsx
//
// The pre/post learning-gain report (P5) — "prove it makes you smarter." Reads
// P1's baseline/post rows (seed fixtures until P1's table lands, clearly
// labeled) and renders per-subject deltas + normalized gain, with a print /
// save-as-PDF export (browser print → PDF; chrome is `print:hidden`).
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Printer,
  TrendingUp,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { learningGainService } from "../learningGainService";
import type { LearningGainPair, LearningGainReport } from "../types";

export function LearningGainReportView({
  backHref = "/education/progress",
}: {
  backHref?: string;
}) {
  const router = useRouter();
  const [report, setReport] = useState<LearningGainReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void learningGainService.getReport().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setReport(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const overallGainPct =
    report?.overallNormalizedGain != null
      ? Math.round(report.overallNormalizedGain * 100)
      : null;
  const overallDeltaPct =
    report?.overallDelta != null ? Math.round(report.overallDelta * 100) : null;

  return (
    <div className="min-h-full w-full bg-textured print:bg-white">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8 print:py-0">
        <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => (backHref ? router.push(backHref) : router.back())}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {report && report.pairs.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              Print / Save as PDF
            </Button>
          )}
        </div>

        <div className="mb-5 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">
            Learning-gain report
          </h1>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 rounded-xl" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-foreground">Couldn&apos;t load the report</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          </div>
        ) : !report || report.pairs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <TrendingUp className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              No learning-gain data yet
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Take a baseline assessment before you study and a post assessment
              after, and your measured improvement will be reported here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {(report.contractPending || report.isSeed) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200 print:hidden">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>Sample data.</strong> Your real pre/post scores appear
                  here once you take baseline and post assessments (the
                  Assessment Engine). These figures are illustrative.
                </span>
              </div>
            )}

            {/* Headline — the "prove it makes you smarter" number */}
            <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-5 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Average improvement
              </p>
              <p className="mt-1 text-4xl font-bold tabular-nums text-primary">
                {overallDeltaPct != null ? `+${overallDeltaPct}` : "—"}
                <span className="text-lg font-medium text-muted-foreground">
                  {" "}
                  points
                </span>
              </p>
              {overallGainPct != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  You closed{" "}
                  <span className="font-semibold text-foreground">
                    {overallGainPct}%
                  </span>{" "}
                  of the gap between what you knew and mastery.
                </p>
              )}
            </section>

            {/* Per-subject pre → post */}
            <section className="flex flex-col gap-3">
              {report.pairs.map((pair) => (
                <SubjectRow key={pair.subject} pair={pair} />
              ))}
            </section>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Improvement = post-assessment score − baseline score. Gap closed
              uses normalized gain (Hake&apos;s g): (post − pre) ÷ (1 − pre) — the
              share of what was left to learn that you actually learned.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectRow({ pair }: { pair: LearningGainPair }) {
  const basePct = Math.round(pair.baseline.score * 100);
  const postPct = Math.round(pair.post.score * 100);
  const deltaPct = Math.round(pair.delta * 100);
  const positive = deltaPct >= 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-foreground">
          {pair.subjectLabel}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            positive
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400",
          )}
        >
          {positive ? "+" : ""}
          {deltaPct} pts
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs">
        <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
          {basePct}%
        </span>
        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted">
          {/* baseline fill (muted) with the post gain layered on top */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/30"
            style={{ width: `${basePct}%` }}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              positive ? "bg-primary" : "bg-red-500",
            )}
            style={{ width: `${postPct}%`, opacity: 0.75 }}
          />
        </div>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="w-10 shrink-0 tabular-nums font-medium text-foreground">
          {postPct}%
        </span>
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>Baseline · {formatDate(pair.baseline.takenAt)}</span>
        <span>Post · {formatDate(pair.post.takenAt)}</span>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
