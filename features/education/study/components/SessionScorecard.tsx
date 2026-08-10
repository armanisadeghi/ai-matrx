"use client";

// features/education/study/components/SessionScorecard.tsx
//
// Gamified, at-a-glance rollup for a session: an animated accuracy ring, a
// headline verdict ("Outstanding!" / "Keep practicing"), the correct/partial/
// missed breakdown, best in-session streak, and duration. Sits above the
// attempt ledger in SessionDetailView. Mode-agnostic — pure client-side
// aggregation over `study_attempt` rows via `summarizeSessionAttempts`
// (`study_session.aggregate_score` is never written today, so nothing here
// trusts it).

import {
  Trophy,
  Flame,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudyAttemptRow, StudySessionRow } from "../types";
import {
  summarizeSessionAttempts,
  formatSessionDuration,
} from "../utils/summarizeSessionAttempts";
import { ScoreRing } from "@/components/official/ScoreRing";

function verdictFor(accuracyPct: number | null): {
  label: string;
  classes: string;
} {
  if (accuracyPct === null) {
    return { label: "In progress", classes: "text-muted-foreground" };
  }
  if (accuracyPct >= 90) {
    return {
      label: "Outstanding!",
      classes: "text-green-600 dark:text-green-400",
    };
  }
  if (accuracyPct >= 75) {
    return {
      label: "Great job!",
      classes: "text-green-600 dark:text-green-400",
    };
  }
  if (accuracyPct >= 50) {
    return {
      label: "Good effort",
      classes: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    label: "Keep practicing",
    classes: "text-red-600 dark:text-red-400",
  };
}

export function SessionScorecard({
  session,
  attempts,
}: {
  session: StudySessionRow;
  attempts: StudyAttemptRow[];
}) {
  if (attempts.length === 0) return null;

  const summary = summarizeSessionAttempts(attempts, session);
  const editedCount = attempts.filter((a) => a.is_manually_edited).length;
  // The weighted score (mean of each attempt's 0-1 score_value, so partial
  // credit counts proportionally) is the fairest single number and tracks the
  // AI coach's own holistic score far more closely than strict accuracy does.
  // Strict accuracy (% of attempts marked fully "correct", zero credit for
  // partial) is a real, different metric — legitimate to show, but not the
  // headline, and only available when there's nothing better to rank by.
  const primaryPct = summary.avgScorePct ?? summary.accuracyPct;
  const verdict = verdictFor(primaryPct);
  const showBothMetrics =
    summary.avgScorePct !== null &&
    summary.accuracyPct !== null &&
    summary.avgScorePct !== summary.accuracyPct;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col items-center gap-4 px-4 pt-5 pb-4 sm:flex-row sm:gap-6">
        {/* Score ring — the headline metric, front and center */}
        <ScoreRing pct={primaryPct} size={112} label="Score" />

        {/* Verdict + the different ways this session's score can be read */}
        <div className="flex flex-1 flex-col items-center gap-1.5 text-center sm:items-start sm:text-left">
          <div className="flex items-center gap-1.5">
            <Trophy className={cn("h-5 w-5", verdict.classes)} />
            <h2 className={cn("text-lg font-semibold", verdict.classes)}>
              {verdict.label}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {summary.graded} of {summary.total}{" "}
            {summary.total === 1 ? "answer" : "answers"} graded
            {summary.durationMs !== null &&
              ` · ${formatSessionDuration(summary.durationMs)}`}
          </p>
          {(showBothMetrics || editedCount > 0) && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
              {showBothMetrics && (
                <>
                  <MetricChip
                    label="Weighted score"
                    value={summary.avgScorePct}
                    hint="Partial credit counts proportionally"
                  />
                  <MetricChip
                    label="Exact match"
                    value={summary.accuracyPct}
                    hint="Only fully-correct answers count"
                  />
                </>
              )}
              {editedCount > 0 && (
                <span
                  title="These scores reflect manual corrections — the original AI grades are kept on record."
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium italic text-muted-foreground"
                >
                  <Pencil className="h-3 w-3" />
                  {editedCount} {editedCount === 1 ? "answer" : "answers"}{" "}
                  edited
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:grid-cols-4">
        <ScoreStat
          icon={CheckCircle2}
          label="Correct"
          value={summary.correct}
          accent="green"
        />
        <ScoreStat
          icon={AlertTriangle}
          label="Partial"
          value={summary.partial}
          accent="amber"
        />
        <ScoreStat
          icon={XCircle}
          label="Missed"
          value={summary.incorrect}
          accent="red"
        />
        <ScoreStat
          icon={Flame}
          label="Best streak"
          value={summary.bestStreak}
          accent="orange"
        />
      </div>
    </section>
  );
}

/** A labeled "here's another way to read this score" pill — the different
 *  scoring methods are shown side by side (not hidden behind a tooltip) so
 *  comparing them is part of the fun, not a footnote. */
function MetricChip({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  if (value === null) return null;
  return (
    <span
      title={hint}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground"
    >
      <span className="tabular-nums">{value}%</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

const ACCENT_CLASSES = {
  green: "text-green-600 dark:text-green-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
} as const;

function ScoreStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  accent: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center sm:items-start sm:text-left">
      <div className={cn("flex items-center gap-1.5", ACCENT_CLASSES[accent])}>
        <Icon className="h-4 w-4" />
        <span className="text-lg font-bold tabular-nums">{value}</span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
