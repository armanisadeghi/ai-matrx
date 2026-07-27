"use client";

// features/education/study/dashboard/StudyTodayCard.tsx
//
// The unified "what should I study next, for how long, and why" centerpiece
// (P5) — the authenticated hero on the education home. It reads across the whole
// study loop (today's plan blocks, FSRS-due reviews, weak areas, goal urgency,
// streak) and surfaces the highest-priority next actions, each with a time
// estimate, a one-line justification, and a deep link into the study surface.
//
// Renders NOTHING when there's no study signal (anon / brand-new user), so the
// marketing hub below is untouched for newcomers.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Flame,
  Target,
  Sparkles,
  ChevronRight,
  Coffee,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { studyService } from "../service/studyService";
import { planService } from "../service/planService";
import { blockHref, blockIcon } from "../planner/blockLinks";
import {
  dueWeakByMode,
  modeReviewHref,
  modeWeakHref,
} from "./nextActions";
import { setStudyTodaySnapshot } from "./studyTodaySnapshot";
import type { StudyPlanBlockRow } from "../planner/types";
import type { StudyGoalRow } from "../types";

const MIN_PER_REVIEW = 0.6;
const MIN_PER_WEAK = 1.2;

interface NextAction {
  key: string;
  icon: typeof Target;
  label: string;
  why: string;
  minutes: number | null;
  href: string | null;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((target - t.getTime()) / 86_400_000);
}

export function StudyTodayCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [hasPlan, setHasPlan] = useState(false);
  const [isRestDay, setIsRestDay] = useState(false);
  const [streak, setStreak] = useState(0);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [planRes, masteryRes, goalsRes, streakRes] = await Promise.all([
        planService.getActivePlan(),
        // Mode-agnostic: the whole cross-mode mastery snapshot (like
        // useStudyAnalytics) so quiz / game / audio due+weak items surface too,
        // not just fc_card.
        studyService.listAllMastery(),
        studyService.listGoals({ status: "active" }),
        studyService.getStreak(),
      ]);
      if (cancelled) return;

      const now = new Date();
      const modeSignals = dueWeakByMode(masteryRes.data ?? [], now);
      const goals = goalsRes.data ?? [];
      const currentStreak = streakRes.data?.current_streak ?? 0;
      setStreak(currentStreak);

      const today = todayIso();
      const plan = planRes.data;
      const todayEntry = plan?.days.find((d) => d.day.day_date === today);
      setHasPlan(!!plan);

      const built: NextAction[] = [];

      // 1) Plan-of-the-day: the active plan's blocks for today (if any).
      if (todayEntry) {
        if (todayEntry.day.is_rest_day) {
          setIsRestDay(true);
        } else {
          for (const b of todayEntry.blocks.filter(
            (x: StudyPlanBlockRow) => x.status === "pending",
          )) {
            built.push({
              key: `block-${b.id}`,
              icon: blockIcon(b.target_kind),
              label: b.label,
              why: b.rationale ?? "From your study plan for today.",
              minutes: b.estimated_minutes,
              href: blockHref(
                b.target_kind,
                (b.target_ref as { topic?: string } | null) ?? null,
              ),
            });
          }
        }
      }

      // 2) No plan blocks → synthesize from the live spine signal, per mode.
      if (built.length === 0 && !isRestDayEntry(todayEntry)) {
        for (const sig of modeSignals) {
          if (sig.due > 0) {
            built.push({
              key: `due-${sig.itemType}`,
              icon: CalendarClock,
              label: `${sig.label}: review ${sig.due} due`,
              why: "Reviewing right as items come due is what makes spaced repetition work.",
              minutes: Math.max(1, Math.round(sig.due * MIN_PER_REVIEW)),
              href: modeReviewHref(sig.itemType),
            });
          }
          if (sig.weak > 0) {
            built.push({
              key: `weak-${sig.itemType}`,
              icon: Flame,
              label: `${sig.label}: drill ${sig.weak} weak`,
              why: "The smallest set of material causing the most errors — biggest gain per minute.",
              minutes: Math.max(1, Math.round(sig.weak * MIN_PER_WEAK)),
              href: modeWeakHref(sig.itemType),
            });
          }
        }
      }

      // 3) Goal urgency (always shown as context if a dated goal is near).
      const urgentGoal = nearestDatedGoal(goals);
      if (urgentGoal) {
        const days = daysUntil(urgentGoal.target_date);
        if (days != null && days >= 0 && days <= 30) {
          built.push({
            key: `goal-${urgentGoal.id}`,
            icon: Target,
            label: urgentGoal.title,
            why:
              days === 0
                ? "Target is today."
                : `${days} day${days === 1 ? "" : "s"} to your target.`,
            minutes: null,
            href: "/education/planner",
          });
        }
      }

      const hasSignal =
        built.length > 0 ||
        !!plan ||
        currentStreak > 0 ||
        goals.length > 0;
      const shown = built.slice(0, 4);
      setEmpty(!hasSignal);
      setActions(shown);
      setLoading(false);

      // Publish for the Education Hub surface emitter (EducationHubSurface),
      // which reads this at agent-trigger time rather than re-fetching the
      // spine. Null when there is no signal → the surface honestly reports
      // `study_snapshot_available: false` for anon / brand-new learners.
      setStudyTodaySnapshot(
        hasSignal
          ? {
              has_active_plan: !!plan,
              is_rest_day: isRestDayEntry(todayEntry),
              streak_days: currentStreak,
              next_actions: shown.map((a) => ({
                key: a.key,
                label: a.label,
                why: a.why,
                minutes: a.minutes,
                href: a.href,
              })),
              total_minutes: shown.reduce((s, a) => s + (a.minutes ?? 0), 0),
            }
          : null,
      );
    })();
    return () => {
      cancelled = true;
      setStudyTodaySnapshot(null);
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  // Nothing to study + no plan/goals/streak → stay out of the way (anon / new).
  if (empty) return null;

  const totalMinutes = actions
    .filter((a) => a.minutes != null)
    .reduce((s, a) => s + (a.minutes ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6">
      <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Study today
            </h2>
            {totalMinutes > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                ~{totalMinutes} min
              </span>
            )}
            {streak > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Flame className="h-3.5 w-3.5" />
                {streak}-day streak
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/education/progress"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View progress
            </Link>
            <Link
              href="/education/planner"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {hasPlan ? "Open plan" : "Make a plan"}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {isRestDay && actions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-4">
            <Coffee className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Rest day — you&apos;ve earned it.
              </p>
              <p className="text-xs text-muted-foreground">
                Your plan protects today for recovery. Rest is part of the plan.
              </p>
            </div>
          </div>
        ) : actions.length === 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                You&apos;re all caught up.
              </p>
              <p className="text-xs text-muted-foreground">
                Nothing due right now — get ahead with a new set or a practice
                quiz.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/education/flashcards")}
            >
              Study something
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <li
                  key={a.key}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {a.label}
                      </span>
                      {a.minutes != null && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          ~{a.minutes} min
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.why}
                    </p>
                  </div>
                  {a.href && (
                    <Button
                      size="sm"
                      className={cn("h-8 shrink-0 gap-1 px-3 text-xs")}
                      onClick={() => router.push(a.href!)}
                    >
                      Start
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function isRestDayEntry(
  entry: { day: { is_rest_day: boolean } } | undefined,
): boolean {
  return !!entry?.day.is_rest_day;
}

function nearestDatedGoal(goals: StudyGoalRow[]): StudyGoalRow | null {
  const dated = goals
    .filter((g) => g.target_date)
    .sort((a, b) => (a.target_date ?? "").localeCompare(b.target_date ?? ""));
  return dated[0] ?? null;
}
