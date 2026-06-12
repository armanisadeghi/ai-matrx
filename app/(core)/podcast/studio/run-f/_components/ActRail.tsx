"use client";

// app/(core)/podcast/studio/run-f/_components/ActRail.tsx
//
// The five-act vertical timeline down the left of the booth. Each act shows
// pending / running / done distinctly: a pending act is muted, a running act
// pulses in its accent with an animated ring, a done act fills with a check.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTS, ACCENT } from "./acts";
import type { BoothState } from "./boothState";

export function ActRail({ state }: { state: BoothState }) {
  return (
    <ol className="relative flex flex-col gap-1">
      {ACTS.map((act, i) => {
        const status = state.acts[act.id];
        const accent = ACCENT[act.accent];
        const Icon = act.icon;
        const isLast = i === ACTS.length - 1;
        const running = status === "running";
        const done = status === "done";
        return (
          <li key={act.id} className="relative flex gap-3">
            {/* Connector spine */}
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-px transition-colors duration-500",
                  done ? accent.bar : "bg-border",
                )}
              />
            )}

            {/* Node */}
            <span
              className={cn(
                "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-500",
                done && cn(accent.bg, "border-transparent"),
                running && cn(accent.bg, "border-transparent ring-2", accent.ring),
                !done && !running && "border-border bg-card",
              )}
            >
              {running && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 animate-ping rounded-full opacity-30",
                    accent.bar,
                  )}
                />
              )}
              {done ? (
                <Check className={cn("h-4.5 w-4.5", accent.text)} strokeWidth={3} />
              ) : (
                <Icon
                  className={cn(
                    "h-4.5 w-4.5 transition-colors",
                    running ? accent.text : "text-muted-foreground",
                  )}
                />
              )}
            </span>

            {/* Label */}
            <div className="min-w-0 flex-1 pb-5 pt-1.5">
              <p
                className={cn(
                  "truncate text-sm font-medium transition-colors",
                  running || done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? act.done : act.title}
              </p>
              {running && (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {act.blurb}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
