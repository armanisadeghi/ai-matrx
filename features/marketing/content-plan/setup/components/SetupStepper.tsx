"use client";

/**
 * The MOBILE shell for Site Setup.
 *
 * Desktop Setup is a three-column workbench: shape on the left, the work order
 * in the middle, the exact routes and the commit button on the right — all
 * visible at once. At 390px those three columns collapse into one endless
 * scroll whose first screens are entirely the shape chooser, so the work
 * order, the page list, the lint/keyword/review checks and the "Make it real"
 * rungs are in the DOM but effectively unreachable.
 *
 * This is the same content recomposed as an EXPLICIT step sequence: one step
 * on screen at a time, a numbered rail that names every step and jumps
 * straight to it, and prev/next controls. Deliberately NOT tabs
 * (`.claude/skills/ios-mobile-first/SKILL.md`): tabs hide their own count,
 * trap scrolling, and read as "more of the same page", where a numbered step
 * sequence states the whole workflow up front and says where you are in it.
 *
 * Purely presentational — every piece of Setup state (draft, counts, agent
 * runs) lives in SetupView and is untouched by moving between steps.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SetupStep {
  id: string;
  /** Short rail label — "Work order", "Pages". */
  label: string;
  content: React.ReactNode;
}

export function SetupStepper({
  title,
  steps,
  activeIndex,
  onSelect,
}: {
  /** The view's semantic title — this is the page's ONE `h1` on mobile. */
  title: string;
  steps: SetupStep[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (steps.length === 0) return null;
  const index = Math.min(Math.max(activeIndex, 0), steps.length - 1);
  const step = steps[index];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-1 px-1 py-1">
          <Button
            variant="ghost"
            className="h-10 w-10 shrink-0 p-0"
            aria-label="Previous step"
            disabled={index === 0}
            onClick={() => onSelect(index - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-sm font-semibold leading-tight text-foreground">
              {title}
            </h1>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              Step {index + 1} of {steps.length} · {step.label}
            </p>
          </div>
          <Button
            variant="ghost"
            className="h-10 w-10 shrink-0 p-0"
            aria-label="Next step"
            disabled={index === steps.length - 1}
            onClick={() => onSelect(index + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* The whole workflow, always named. Horizontal scroll is the ONE
          deliberate exception to single-scroll: it is a short nav rail, not
          content, and it never traps a vertical gesture. */}
        <nav
          aria-label="Setup steps"
          className="scrollbar-none flex gap-1.5 overflow-x-auto px-2 pb-1.5"
        >
          {steps.map((item, itemIndex) => {
            const active = itemIndex === index;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(itemIndex)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {itemIndex + 1}. {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* THE single scroll area for the view. */}
      <div
        key={step.id}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe"
      >
        {step.content}
        <div className="flex gap-2 px-4 pb-4 pt-5">
          {index > 0 ? (
            <Button
              variant="outline"
              className="h-10 flex-1 gap-1.5"
              onClick={() => onSelect(index - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              {steps[index - 1].label}
            </Button>
          ) : null}
          {index < steps.length - 1 ? (
            <Button
              variant="outline"
              className="h-10 flex-1 gap-1.5"
              onClick={() => onSelect(index + 1)}
            >
              {steps[index + 1].label}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
