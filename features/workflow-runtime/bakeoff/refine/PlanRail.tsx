"use client";

/**
 * PlanRail — every step of the definition, visible from frame zero, in one
 * scannable column. Designed to look right at 4 steps and stay right at 40:
 * compact fixed-rhythm rows, a connecting spine, its own scroll region, and
 * the active step auto-scrolled into view.
 *
 * On mobile the same data renders as a horizontal chip strip (the vertical
 * rail would cost the reader the whole first screen).
 */

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver";

import { PhaseIcon } from "../../components/readout-parts";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
} from "../../components/run/node-presentation";
import { formatDuration, type StepView } from "./plan-view";

const PHASE_WORD: Record<string, string> = {
  idle: "Up next",
  waiting: "Waiting its turn",
  running: "Working now",
  retrying: "Trying again",
  settled: "Done",
  failed: "Needs attention",
  skipped: "Not needed",
};

function rightFact(view: StepView): string | null {
  if (view.phase === "settled" && view.durationMs !== null) {
    return formatDuration(view.durationMs);
  }
  if (view.expectedCount > 1 && view.invocations.length > 0) {
    return `${view.settledCount}/${Math.max(view.expectedCount, view.invocations.length)}`;
  }
  return null;
}

function StepRow({
  view,
  isLast,
  active,
}: {
  view: StepView;
  isLast: boolean;
  active: boolean;
}) {
  const rowRef = useRef<HTMLLIElement | null>(null);
  const { step, phase } = view;
  const style = FAMILY_STYLE[step.family];

  useEffect(() => {
    if (active) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active]);

  return (
    <li ref={rowRef} className="relative pl-9">
      {!isLast ? (
        <span
          aria-hidden
          className="absolute left-[13px] top-8 h-[calc(100%-1.25rem)] w-px bg-border"
        />
      ) : null}
      <span
        className={cn(
          "absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-lg border",
          style.bg,
          phase === "running" || phase === "retrying"
            ? style.ring
            : "border-transparent",
        )}
      >
        <IconResolver
          iconName={step.iconName ?? FAMILY_ICON[step.family]}
          className={cn("h-3.5 w-3.5", style.text)}
        />
      </span>
      <div
        className={cn(
          "rounded-lg px-2 py-1.5 transition-colors",
          active && "bg-primary/5",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-medium",
              phase === "idle" || phase === "waiting"
                ? "text-muted-foreground"
                : "text-foreground",
            )}
            title={step.label}
          >
            {step.label}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
            {rightFact(view)}
            <PhaseIcon phase={phase} />
          </span>
        </div>
        {active ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {view.progressLine ?? PHASE_WORD[phase] ?? "Working now"}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function PlanRail({ views }: { views: StepView[] }) {
  const doneCount = views.filter(
    (view) => view.phase === "settled" || view.phase === "skipped",
  ).length;
  const activeIndex = views.findIndex(
    (view) => view.phase === "running" || view.phase === "retrying",
  );

  return (
    <section
      aria-label="The plan"
      className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card"
    >
      <header className="flex shrink-0 items-baseline justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          The plan
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {doneCount} of {views.length} done
        </span>
      </header>
      <ol className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {views.map((view, index) => (
          <StepRow
            key={view.step.nodeId}
            view={view}
            isLast={index === views.length - 1}
            active={index === activeIndex}
          />
        ))}
      </ol>
    </section>
  );
}

/** The same plan as one horizontal strip — the mobile form of the rail. */
export function PlanStrip({ views }: { views: StepView[] }) {
  const stripRef = useRef<HTMLOListElement | null>(null);
  const activeIndex = views.findIndex(
    (view) => view.phase === "running" || view.phase === "retrying",
  );

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = stripRef.current?.children[activeIndex];
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex]);

  return (
    <ol
      ref={stripRef}
      aria-label="The plan"
      className="scrollbar-hide flex shrink-0 items-stretch gap-1.5 overflow-x-auto pb-1"
    >
      {views.map((view, index) => {
        const style = FAMILY_STYLE[view.step.family];
        const active = index === activeIndex;
        return (
          <li
            key={view.step.nodeId}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1",
              active ? "border-primary/40 bg-primary/5" : "border-border bg-card",
            )}
          >
            <IconResolver
              iconName={view.step.iconName ?? FAMILY_ICON[view.step.family]}
              className={cn("h-3 w-3", style.text)}
            />
            <span className="max-w-32 truncate text-[11px] font-medium text-foreground">
              {view.step.label}
            </span>
            <PhaseIcon phase={view.phase} />
          </li>
        );
      })}
    </ol>
  );
}
