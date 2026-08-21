"use client";

// features/education/onboard/components/KitDepthPicker.tsx
//
// How much kit the student wants. Before this existed, the size of every study
// kit was a constant nobody could see or change, and a 77-slide upload came back
// as ten flashcards with no explanation and no lever.
//
// TWO controls, deliberately, and the second is optional:
//   - DEPTH scales the whole kit at once (quick / standard / thorough). A
//     student should not have to size seven artifacts one at a time.
//   - An exact CARD/QUESTION count, for the student who knows they want 40.
//     Blank is the honest default: the kit sizes itself to the material.
//
// Both feed `ConvertOptions` and are interpreted by the coverage planner
// (`features/education/convert/coverage.ts`), which spreads whatever number
// results across the WHOLE document rather than the first section of it.

import { Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CoverageDepth } from "@/features/education/convert/coverage";

const DEPTHS: {
  value: CoverageDepth;
  label: string;
  hint: string;
}[] = [
  { value: "quick", label: "Quick", hint: "The essentials only" },
  { value: "standard", label: "Standard", hint: "Sized to your material" },
  { value: "thorough", label: "Thorough", hint: "Cover everything in depth" },
];

export function KitDepthPicker({
  depth,
  onDepth,
  count,
  onCount,
}: {
  depth: CoverageDepth;
  onDepth: (d: CoverageDepth) => void;
  /** Empty string = let the kit size itself. */
  count: string;
  onCount: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Gauge className="h-3.5 w-3.5" />
        How much do you want?
      </label>
      <div className="grid grid-cols-3 gap-2">
        {DEPTHS.map((d) => {
          const active = depth === d.value;
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => onDepth(d.value)}
              aria-pressed={active}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "block text-sm font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {d.label}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {d.hint}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={150}
          inputMode="numeric"
          value={count}
          onChange={(e) => onCount(e.target.value)}
          placeholder="Auto"
          className="h-9 w-24 text-base"
          aria-label="Exact number of cards and questions"
        />
        <p className="text-[11px] text-muted-foreground">
          Exact number of cards / questions. Leave blank and we size the kit to
          how much material you gave us.
        </p>
      </div>
    </div>
  );
}
