"use client";

// features/education/study/components/StudyProgress.tsx
//
// Study progress overview (VISION §16). A read-only dashboard over the shared
// study spine — mastery distribution, cards due now, overall accuracy, activity —
// so a learner can see how they've done and what to study next. Mode-agnostic
// (keyed by item_type); flashcards is the first consumer, every mode reuses it.
// Pure client-side aggregation over item_mastery + study_session (no new DB
// objects); moves to an RPC only if a learner's studied-item count outgrows it.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  Target,
  CalendarClock,
  Flame,
  Layers,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { studyService } from "../service/studyService";
import type { ItemMasteryRow } from "../types";

interface Summary {
  studied: number;
  mastered: number;
  learning: number;
  struggling: number;
  dueNow: number;
  totalAttempts: number;
  accuracyPct: number | null;
  bestStreak: number;
  sessions: number;
}

function summarize(mastery: ItemMasteryRow[], sessions: number): Summary {
  const now = Date.now();
  let mastered = 0;
  let learning = 0;
  let struggling = 0;
  let dueNow = 0;
  let totalAttempts = 0;
  let totalCorrect = 0;
  let bestStreak = 0;
  for (const m of mastery) {
    const score = m.mastery_score ?? 0;
    if (m.struggle_flag || score < 0.4) struggling += 1;
    else if (score >= 0.8) mastered += 1;
    else learning += 1;
    if (m.due_at && new Date(m.due_at).getTime() <= now) dueNow += 1;
    totalAttempts += m.attempt_count ?? 0;
    totalCorrect += m.correct_count ?? 0;
    if ((m.streak ?? 0) > bestStreak) bestStreak = m.streak ?? 0;
  }
  return {
    studied: mastery.length,
    mastered,
    learning,
    struggling,
    dueNow,
    totalAttempts,
    accuracyPct:
      totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null,
    bestStreak,
    sessions,
  };
}

export function StudyProgress({
  itemType = "fc_card",
  title = "Your progress",
  backHref,
}: {
  itemType?: string;
  title?: string;
  backHref?: string;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [masteryRes, sessionsRes] = await Promise.all([
        studyService.listMastery(itemType),
        studyService.listSessions({ limit: 500 }),
      ]);
      if (cancelled) return;
      if (masteryRes.error) {
        setError(masteryRes.error);
        setSummary(null);
      } else {
        setError(null);
        setSummary(
          summarize(masteryRes.data ?? [], (sessionsRes.data ?? []).length),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemType]);

  const distTotal = summary
    ? Math.max(1, summary.mastered + summary.learning + summary.struggling)
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

        <div className="mb-5 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
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
        ) : !summary || summary.studied === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <Layers className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No progress yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Study a set or run a Fast Fire drill and your mastery, accuracy, and
              what&apos;s due will show up here.
            </p>
          </div>
        ) : (
          <>
            {/* Headline stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                icon={Layers}
                label="Cards studied"
                value={`${summary.studied}`}
              />
              <Stat
                icon={Target}
                label="Accuracy"
                value={summary.accuracyPct === null ? "—" : `${summary.accuracyPct}%`}
              />
              <Stat
                icon={CalendarClock}
                label="Due now"
                value={`${summary.dueNow}`}
                accent={summary.dueNow > 0 ? "amber" : undefined}
              />
              <Stat icon={Flame} label="Best streak" value={`${summary.bestStreak}`} />
            </div>

            {/* Mastery distribution */}
            <section className="mt-5 rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-medium text-foreground">
                Mastery
              </h2>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-green-500"
                  style={{ width: `${(summary.mastered / distTotal) * 100}%` }}
                />
                <div
                  className="bg-amber-500"
                  style={{ width: `${(summary.learning / distTotal) * 100}%` }}
                />
                <div
                  className="bg-red-500"
                  style={{ width: `${(summary.struggling / distTotal) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <Legend color="bg-green-500" label="Mastered" value={summary.mastered} />
                <Legend color="bg-amber-500" label="Learning" value={summary.learning} />
                <Legend color="bg-red-500" label="Needs work" value={summary.struggling} />
              </div>
            </section>

            {/* Activity */}
            <section className="mt-3 grid grid-cols-2 gap-3">
              <Stat icon={TrendingUp} label="Total answers" value={`${summary.totalAttempts}`} />
              <Stat icon={CalendarClock} label="Sessions" value={`${summary.sessions}`} />
            </section>
          </>
        )}
      </div>
    </div>
  );
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
  accent?: "amber";
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
          accent === "amber" ? "text-amber-600 dark:text-amber-400" : "text-foreground",
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
