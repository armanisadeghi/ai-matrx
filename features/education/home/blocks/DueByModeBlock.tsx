"use client";

// features/education/home/blocks/DueByModeBlock.tsx
//
// What's waiting, per study mode — the "you have work banked" block.
//
// Distinct from Study Today on purpose: Study Today says do THESE four things
// now; this says here is everything outstanding, by mode, so a learner who has
// twenty minutes and a preference ("I'd rather do flashcards than a quiz") can
// choose. Cross-mode by construction — the spine records spoken practice and
// graded work alongside cards, and a learner who only ever sees flashcard
// counts learns that the other modes don't count.

import Link from "next/link";
import { CalendarClock, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { modeReviewHref, modeWeakHref } from "../../study/dashboard/nextActions";
import type { EducationSnapshot } from "../types";

export function DueByModeBlock({ snapshot }: { snapshot: EducationSnapshot }) {
  const modes = snapshot.study.modes.filter((m) => m.due > 0 || m.weak > 0);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Waiting for you</h2>
        <Link
          href="/education/progress"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          All progress
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map((mode) => {
          const reviewHref = modeReviewHref(mode.itemType);
          const weakHref = modeWeakHref(mode.itemType);
          return (
            <div
              key={mode.itemType}
              className="rounded-xl border border-border bg-card p-3"
            >
              <p className="truncate text-sm font-medium text-foreground">
                {mode.label}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mode.due > 0 && (
                  <Chip
                    href={reviewHref}
                    tone="bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    icon={<CalendarClock className="h-3.5 w-3.5" />}
                    label={`${mode.due} due`}
                  />
                )}
                {mode.weak > 0 && (
                  <Chip
                    href={weakHref}
                    tone="bg-rose-500/10 text-rose-700 dark:text-rose-400"
                    icon={<Flame className="h-3.5 w-3.5" />}
                    label={`${mode.weak} weak`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * A count is a door (THE DOOR LAW). When a mode genuinely has no review surface
 * yet the chip renders as plain text rather than as a link that goes nowhere —
 * it still tells the truth about the number.
 */
function Chip({
  href,
  tone,
  icon,
  label,
}: {
  href: string | null;
  tone: string;
  icon: React.ReactNode;
  label: string;
}) {
  const className = cn(
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
    tone,
  );
  if (!href) return <span className={className}>{icon}{label}</span>;
  return (
    <Link href={href} className={cn(className, "transition-colors hover:brightness-110")}>
      {icon}
      {label}
    </Link>
  );
}
