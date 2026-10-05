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
import { modeReviewHref, modeWeakHref } from "../../study/dashboard/nextActions";
import type { EducationSnapshot } from "../types";
import { Chip, ChipSet, type ChipTone } from "@ai-matrx/design-system/controls";

export function DueByModeBlock({ snapshot }: { snapshot: EducationSnapshot }) {
  const modes = snapshot.study.modes.filter((m) => m.due > 0 || m.weak > 0);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Waiting for you</h2>
        <Link
          href="/education/progress"
          data-tap-target
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
              <ChipSet className="mt-2">
                {mode.due > 0 && (
                  <CountChip
                    href={reviewHref}
                    tone="warning"
                    icon={<CalendarClock />}
                    label={`${mode.due} due`}
                  />
                )}
                {mode.weak > 0 && (
                  <CountChip
                    href={weakHref}
                    tone="rose"
                    icon={<Flame />}
                    label={`${mode.weak} weak`}
                  />
                )}
              </ChipSet>
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
 * it still tells the truth about the number. THE chip (design-system), never a
 * local twin.
 */
function CountChip({
  href,
  tone,
  icon,
  label,
}: {
  href: string | null;
  tone: ChipTone;
  icon: React.ReactNode;
  label: string;
}) {
  if (!href) return <Chip tone={tone} icon={icon} label={label} />;
  return (
    <Chip asChild tone={tone} icon={icon} label={label}>
      <Link href={href} />
    </Chip>
  );
}
