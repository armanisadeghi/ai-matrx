"use client";

// features/education/study/analytics/components/StudyAnalyticsView.tsx
//
// The PURE presentational body of the cross-mode progress dashboard — the outcome
// -first stats, mastery distribution, per-mode breakdown, highest-leverage weak
// areas, learning-gain teaser, and trends. It takes fully-folded data (never
// fetches) so BOTH the self dashboard (`StudyAnalyticsDashboard`, over the
// current user's spine) and the guardian dashboard
// (`features/education/family/StudentProgressView`, over a linked student's spine
// via the gated guardian RPCs) render the SAME surface. `readOnly` strips every
// study-action CTA — a guardian views, never acts on the student's queue.
//
// React Compiler is on: no manual memo.

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  Target,
  CalendarClock,
  Flame,
  Layers,
  Clock,
  AlertCircle,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { StudyTrends } from "../../components/StudyTrends";
import { learningGainService } from "../../learning-gain/learningGainService";
import type { LearningGainReport } from "../../learning-gain/types";
import type { ItemMasteryRow } from "../../types";
import type { StudyAnalytics } from "../computeAnalytics";

export interface StudyAnalyticsViewProps {
  analytics: StudyAnalytics | null;
  /** Raw mastery rows (all item types) — passed to StudyTrends without refetch. */
  mastery: ItemMasteryRow[];
  gain: LearningGainReport | null;
  loading: boolean;
  error: string | null;
  /** Headline, e.g. "Your progress" (self) or "Ava's progress" (guardian). */
  heading?: string;
  backHref?: string;
  /**
   * Read-only guardian mode: hides every study-action CTA (Review due, Drill weak
   * areas, Start studying) and makes the learning-gain teaser non-interactive.
   */
  readOnly?: boolean;
  /** Optional narrative node — the self dashboard passes <NarrativeCard/>. */
  narrative?: ReactNode;
  /** Where the learning-gain teaser links (self only); omit for a static card. */
  learningGainHref?: string;
  /** Empty-state helper copy (differs for guardian vs self). */
  emptyHint?: string;
}

export function StudyAnalyticsView({
  analytics,
  mastery,
  gain,
  loading,
  error,
  heading = "Your progress",
  backHref = "/education",
  readOnly = false,
  narrative,
  learningGainHref,
  emptyHint,
}: StudyAnalyticsViewProps) {
  const router = useRouter();

  const fcMastery = mastery.filter((m) => m.item_type === "fc_card");
  const dist = analytics
    ? Math.max(
        1,
        analytics.overall.mastered +
          analytics.overall.learning +
          analytics.overall.struggling,
      )
    : 1;

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 h-8 px-2 text-xs text-muted-foreground"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">{heading}</h1>
          </div>
          {!readOnly && analytics && analytics.overall.dueNow > 0 && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => router.push("/education/flashcards/review")}
            >
              <CalendarClock className="h-4 w-4" />
              Review {analytics.overall.dueNow} due
            </Button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-foreground">Couldn&apos;t load progress</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          </div>
        ) : !analytics || !analytics.hasData ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <Layers className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No progress yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {emptyHint ??
                "Study a set or run a Fast Fire drill and your mastery, accuracy, trends, and what to study next will show up here."}
            </p>
            {!readOnly && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => router.push("/education/flashcards")}
              >
                Start studying
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* AI narrative — the "prove it makes you smarter" headline (self only). */}
            {narrative}

            {/* Outcome-first headline stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              <Stat
                icon={Target}
                label="Accuracy"
                value={
                  analytics.overall.accuracyPct == null
                    ? "—"
                    : `${analytics.overall.accuracyPct}%`
                }
              />
              <Stat
                icon={Trophy}
                label="Mastered"
                value={`${analytics.overall.mastered}`}
                accent="green"
              />
              <Stat
                icon={Layers}
                label="Studied"
                value={`${analytics.overall.studied}`}
              />
              <Stat
                icon={CalendarClock}
                label="Due now"
                value={`${analytics.overall.dueNow}`}
                accent={analytics.overall.dueNow > 0 ? "amber" : undefined}
              />
              <Stat
                icon={Flame}
                label="Day streak"
                value={`${analytics.currentStreak}`}
                accent={analytics.currentStreak > 0 ? "amber" : undefined}
              />
              <Stat
                icon={Clock}
                label="Time"
                value={formatMinutes(analytics.totalMinutes)}
              />
            </div>

            {/* Mastery distribution */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-medium text-foreground">Mastery</h2>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-green-500"
                  style={{ width: `${(analytics.overall.mastered / dist) * 100}%` }}
                />
                <div
                  className="bg-amber-500"
                  style={{ width: `${(analytics.overall.learning / dist) * 100}%` }}
                />
                <div
                  className="bg-red-500"
                  style={{ width: `${(analytics.overall.struggling / dist) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <Legend color="bg-green-500" label="Mastered" value={analytics.overall.mastered} />
                <Legend color="bg-amber-500" label="Learning" value={analytics.overall.learning} />
                <Legend color="bg-red-500" label="Needs work" value={analytics.overall.struggling} />
              </div>
            </section>

            {/* Per-mode breakdown — only meaningful once >1 mode records */}
            {analytics.byMode.length > 1 && (
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-medium text-foreground">
                  By study mode
                </h2>
                <ul className="flex flex-col gap-2">
                  {analytics.byMode.map((mode) => (
                    <li
                      key={mode.itemType}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-foreground">{mode.label}</span>
                      <span className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                        <span>{mode.studied} studied</span>
                        <span>
                          {mode.accuracyPct == null
                            ? "—"
                            : `${mode.accuracyPct}% acc`}
                        </span>
                        <span className="text-green-600 dark:text-green-400">
                          {mode.mastered} mastered
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Weak areas — the smallest subset causing the most errors */}
            {analytics.weakTopics.filter((t) => t.struggling > 0).length > 0 && (
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Flame className="h-4 w-4 text-red-500" />
                  <h2 className="text-sm font-medium text-foreground">
                    Highest-leverage fixes
                  </h2>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  The smallest set of material causing the most errors — clear
                  these first.
                </p>
                <ul className="flex flex-col gap-2">
                  {analytics.weakTopics
                    .filter((t) => t.struggling > 0)
                    .slice(0, 5)
                    .map((t) => (
                      <li key={t.topic} className="flex items-center gap-3">
                        <span
                          className="w-32 shrink-0 truncate text-xs text-foreground"
                          title={t.topic}
                        >
                          {t.topic}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              t.masteryPct >= 80
                                ? "bg-green-500"
                                : t.masteryPct >= 40
                                  ? "bg-amber-500"
                                  : "bg-red-500",
                            )}
                            style={{ width: `${Math.max(4, t.masteryPct)}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {t.masteryPct}%
                        </span>
                      </li>
                    ))}
                </ul>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-1.5"
                    onClick={() => router.push("/education/flashcards/weak-areas")}
                  >
                    <Flame className="h-4 w-4" />
                    Drill weak areas
                  </Button>
                )}
              </section>
            )}

            {/* Learning-gain teaser → full report (interactive only when a href is given) */}
            <LearningGainTeaser
              gain={gain}
              onOpen={
                learningGainHref
                  ? () => router.push(learningGainHref)
                  : undefined
              }
            />

            {/* Trends (accuracy-over-time, weekly time, by-topic) — reuse. */}
            <StudyTrends
              itemType="fc_card"
              mastery={fcMastery}
              topicSource="fc_card"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LearningGainTeaser({
  gain,
  onOpen,
}: {
  gain: LearningGainReport | null;
  onOpen?: () => void;
}) {
  if (!gain || gain.pairs.length === 0) return null;
  const deltaPct =
    gain.overallDelta != null ? Math.round(gain.overallDelta * 100) : null;
  const body = (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium text-foreground">Learning gain</h2>
        {gain.isSeed && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Sample
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {deltaPct != null
          ? `Average pre → post gain of +${deltaPct} points across ${gain.pairs.length} ${gain.pairs.length === 1 ? "topic" : "topics"}.`
          : "See the pre/post learning-gain report."}
      </p>
    </div>
  );
  if (!onOpen) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
    >
      {body}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Re-exported so callers can prefetch/format consistently. */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  accent?: "amber" | "green";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <div
        className={cn(
          "text-xl font-semibold tabular-nums",
          accent === "amber"
            ? "text-amber-600 dark:text-amber-400"
            : accent === "green"
              ? "text-green-600 dark:text-green-400"
              : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 rounded-sm", color)} />
      {label} <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}
