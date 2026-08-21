"use client";

// features/education/spoken-practice/components/SpokenPracticeHome.tsx
//
// The list-first landing for Spoken Practice: pick one of the three signature
// modes. (Entry page = a list of what you can do, never a forced workspace.)

import { ArrowRight, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODE_CONFIG } from "../constants";
import { SPOKEN_PRACTICE_MODES, type SpokenPracticeMode } from "../types";

export function SpokenPracticeHome({
  onPick,
}: {
  onPick: (mode: SpokenPracticeMode) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <Mic className="h-3.5 w-3.5" />
        Voice-first · graded on meaning
      </div>

      <div className="grid gap-3">
        {SPOKEN_PRACTICE_MODES.map((mode) => {
          const cfg = MODE_CONFIG[mode];
          const Icon = cfg.icon;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onPick(mode)}
              className={cn(
                "group flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left",
                "transition-colors hover:border-primary/40 hover:bg-accent",
              )}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {cfg.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {cfg.tagline}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
