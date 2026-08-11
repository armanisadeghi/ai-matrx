"use client";

// features/education/assessment/components/results/AssessmentResults.tsx
//
// The scored results page: overall score, per-item review (what you answered,
// the correct answer, why, cited sources), and — for a learning-gain taking —
// the persisted baseline→post delta or the "take the post-test" CTA. Reads the
// finalized assessment_result.detail snapshot joined with the live items.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowLeft,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { VerifyAgainstSourceButton } from "@/features/education/trust/components/VerifyAgainstSourceButton";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { assessmentService } from "../../data/assessmentService";
import { pairLearningGain } from "../../data/learningGain";
import { assessmentListDoor, kindConfigFor } from "../kindConfig";
import type {
  AssessmentItemRow,
  AssessmentResultRow,
  AssessmentRow,
  AttemptResult,
  ResultItemDetail,
} from "../../data/types";

const RESULT_ICON: Record<AttemptResult, { icon: typeof CheckCircle2; className: string }> = {
  correct: { icon: CheckCircle2, className: "text-green-600 dark:text-green-400" },
  partial: { icon: MinusCircle, className: "text-amber-600 dark:text-amber-400" },
  incorrect: { icon: XCircle, className: "text-red-600 dark:text-red-400" },
};

function asDetail(raw: unknown): ResultItemDetail[] {
  return Array.isArray(raw) ? (raw as ResultItemDetail[]) : [];
}

export function AssessmentResults({
  assessmentId,
  resultId,
}: {
  assessmentId: string;
  resultId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [items, setItems] = useState<AssessmentItemRow[]>([]);
  const [result, setResult] = useState<AssessmentResultRow | null>(null);
  const [gainDelta, setGainDelta] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Which read failed decides which record the gate resolves — the assessment
  // and its scored result are two different rows with two different owners of
  // the answer "why can't I see this?".
  const [assessmentError, setAssessmentError] = useState<unknown>(null);
  const [resultError, setResultError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [aw, r] = await Promise.all([
        assessmentService.getAssessmentWithItems(assessmentId),
        assessmentService.getResult(resultId),
      ]);
      if (cancelled) return;
      setAssessmentError(null);
      setResultError(null);
      // Each read is recorded on its own: which row is missing decides which
      // record the gate explains, so a readable assessment must not be thrown
      // away because its result failed.
      if (aw.error || !aw.data) {
        setAssessment(null);
        setAssessmentError(aw.error ?? null);
      } else {
        setAssessment(aw.data.assessment);
        setItems(aw.data.items);
      }
      if (r.error || !r.data) {
        setResult(null);
        setResultError(r.error ?? null);
      } else {
        setResult(r.data);
        // Learning-gain delta for a post-test.
        if (r.data.phase === "post") {
          const gains = await assessmentService.listGainResults();
          if (!cancelled && !gains.error) {
            const pair = pairLearningGain(gains.data ?? []).find(
              (p) => p.post?.id === r.data!.id,
            );
            setGainDelta(pair?.delta ?? null);
          }
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId, resultId, reloadKey]);

  if (loading) {
    return (
      <div className="min-h-full w-full bg-textured">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="mt-4 h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (!assessment || !result) {
    // Whichever row didn't arrive is the one the gate must explain; the door
    // out of a missing RESULT is the assessment itself, which they may well
    // still be able to open.
    const door = assessmentListDoor(pathname);
    const onAssessment = !assessment;
    return (
      <div className="min-h-full w-full bg-textured">
        <AccessGate
          token={onAssessment ? "assessment" : "assessment_result"}
          id={onAssessment ? assessmentId : resultId}
          error={onAssessment ? assessmentError : resultError}
          onRetry={() => setReloadKey((k) => k + 1)}
          fallbackHref={onAssessment ? door.href : `${door.href}/${assessmentId}`}
          fallbackLabel={
            onAssessment ? door.label : `Back to this ${door.noun}`
          }
        />
      </div>
    );
  }

  const config = kindConfigFor(assessment.assessment_kind);
  const base = `/education/${config.base}`;
  const detail = asDetail(result.detail);
  const detailById = new Map(detail.map((d) => [d.itemId, d]));
  const scorePct = Math.round(Number(result.score_value ?? 0) * 100);

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => startTransition(() => router.push(`${base}/${assessmentId}`))}
            aria-label="Back to assessment"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {assessment.title}
            </h1>
            <p className="text-xs text-muted-foreground">Results</p>
          </div>
        </div>

        {/* Scorecard */}
        <div className="mt-5 flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div
            className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold tabular-nums",
              scorePct >= 80
                ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                : scorePct >= 50
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
            )}
          >
            {scorePct}%
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {result.correct_count} of {result.total_count} correct
                {result.partial_count > 0 && ` · ${result.partial_count} partial`}
              </span>
            </div>
            {result.duration_seconds != null && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Completed in {Math.floor(result.duration_seconds / 60)}m{" "}
                {result.duration_seconds % 60}s
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              startTransition(() => router.push(`${base}/${assessmentId}?start=1`))
            }
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Retake
          </Button>
        </div>

        {/* Learning gain */}
        {result.phase === "baseline" && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground">
              Baseline recorded.
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Now study this material. When you&apos;re ready, take the post-test
              to see your measured improvement.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() =>
                startTransition(() =>
                  router.push(
                    `${base}/${assessmentId}?start=1&phase=post&gain=${result.gain_group_id ?? ""}`,
                  ),
                )
              }
            >
              Take the post-test
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}
        {result.phase === "post" && gainDelta != null && (
          <div
            className={cn(
              "mt-4 flex items-center gap-3 rounded-xl border p-4",
              gainDelta >= 0
                ? "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
                : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20",
            )}
          >
            {gainDelta >= 0 ? (
              <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
            ) : (
              <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                Learning gain: {gainDelta >= 0 ? "+" : ""}
                {Math.round(gainDelta * 100)} points
              </p>
              <p className="text-xs text-muted-foreground">
                Your post-test score vs. your baseline on this material.
              </p>
            </div>
          </div>
        )}

        {/* Per-item review */}
        <div className="mt-6 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground">Review</h2>
          {items.map((item, i) => {
            const d = detailById.get(item.id);
            const res = (d?.result ?? "incorrect") as AttemptResult;
            const { icon: RIcon, className } = RESULT_ICON[res];
            const trust = coerceTrustEnvelope(item.trust);
            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-2">
                  <RIcon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {i + 1}. {item.prompt}
                    </p>
                    {d?.response != null && d.response !== "" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Your answer:{" "}
                        <span className="text-foreground">{d.response}</span>
                      </p>
                    )}
                    {item.correct_answer &&
                      item.question_type !== "written_response" && (
                        <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
                          Correct: {item.correct_answer}
                        </p>
                      )}
                    {item.explanation && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.explanation}
                      </p>
                    )}
                    {/* The grader's reasoning about THIS answer — the paid,
                        pedagogically valuable half of the grade. Shown only
                        when it says something the item's own explanation
                        doesn't (objective items grade locally and reuse it). */}
                    {d?.explanation &&
                      d.explanation.trim() !== "" &&
                      d.explanation.trim() !== (item.explanation ?? "").trim() && (
                        <p className="mt-1 text-xs text-foreground">
                          <span className="font-medium">Why: </span>
                          {d.explanation}
                        </p>
                      )}
                    {d?.misconception && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        Watch out: {d.misconception}
                      </p>
                    )}
                    <SourceCitations trust={trust} className="mt-2" />
                    <VerifyAgainstSourceButton
                      trust={trust}
                      front={item.prompt}
                      back={item.correct_answer ?? ""}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
