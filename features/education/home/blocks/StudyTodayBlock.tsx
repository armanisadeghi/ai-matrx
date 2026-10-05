"use client";

// features/education/home/blocks/StudyTodayBlock.tsx
//
// "What should I study, for how long, and why" — the hero once a learner has a
// plan, a streak, a goal, or anything due.
//
// Presentational ONLY. This was previously `StudyTodayCard`, which fetched the
// plan + mastery + goals + streak itself while sitting on the marketing page;
// it now takes the shared home snapshot, so the four spine reads happen once
// per visit instead of once per component that wants to know what is due.
//
// Every action carries a reason. A next-action list without reasons is a to-do
// list, and a to-do list is the thing students already have and already ignore.

import Link from "next/link";
import { ArrowRight, ChevronRight, Coffee, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Button as ControlButton, ControlRow, RowGroup, SettingRow } from "@ai-matrx/design-system/controls";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";
import { InstallStudyAppButton } from "../../components/InstallStudyAppButton";
import type { EducationSnapshot } from "../types";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export function StudyTodayBlock({ snapshot }: { snapshot: EducationSnapshot }) {
  const { study, nextActions } = snapshot;
  const totalMinutes = nextActions.reduce((sum, a) => sum + (a.minutes ?? 0), 0);

  return (
    <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AGENT_ICON className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">
            Study today
          </h2>
          {totalMinutes > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              ~{totalMinutes} min
            </span>
          )}
          {study.streakDays > 0 && (
            <span className="matrx-glyph-trim inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Flame className="h-3.5 w-3.5" />
              {study.streakDays}-day streak
            </span>
          )}
        </div>
        {/* One control row: every action here is the same quiet control, so the
            three sit on one line (they used to be three differently built text
            links at three heights on a phone). */}
        <ControlRow>
          {/* Renders nothing unless this browser can actually install. */}
          <InstallStudyAppButton />
          {/* THE DOOR LAW — every AI step in education is a Mandate the learner
              may re-point at their own agent, and no education surface named
              that. Deep-linked to the `education` domain. */}
          <MandateDoorLink feature="education" label="Study agents" variant="inline" />
          <ControlButton variant="quiet" asChild>
            <Link href="/education/progress">Progress</Link>
          </ControlButton>
          <ControlButton variant="quiet" asChild iconEnd={<ArrowRight />}>
            <Link href="/education/planner">
              {study.plan ? "Open plan" : "Make a plan"}
            </Link>
          </ControlButton>
        </ControlRow>
      </div>

      {study.isRestDay && nextActions.length === 0 ? (
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
      ) : nextActions.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              You&apos;re all caught up.
            </p>
            <p className="text-xs text-muted-foreground">
              Nothing due right now — get ahead with a new set or a practice quiz.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/education/library">Study something</Link>
          </Button>
        </div>
      ) : (
        // THE ROW PATTERN (design-system RowGroup + SettingRow): the title gets
        // the row's width and truncates last; the minutes ride in the 12px line
        // with the reason; the one Start control never yields width. The old
        // card-per-item gave the button and "~31 min" more room than the title
        // ("Flashcards: r…" at 375px, 2026-10-04).
        <RowGroup>
          {nextActions.map((action) => {
            const Icon = action.icon;
            return (
              <SettingRow
                key={action.key}
                label={
                  <>
                    <Icon className="mr-1.5 inline h-4 w-4 align-[-3px] text-primary" />
                    {action.label}
                  </>
                }
                line={
                  action.minutes != null
                    ? `~${action.minutes} min · ${action.why}`
                    : action.why
                }
              >
                {action.href && (
                  <ControlButton variant="primary" asChild iconEnd={<ChevronRight />}>
                    <Link href={action.href}>Start</Link>
                  </ControlButton>
                )}
              </SettingRow>
            );
          })}
        </RowGroup>
      )}
    </section>
  );
}
