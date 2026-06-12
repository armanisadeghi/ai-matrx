"use client";

// app/(core)/podcast/studio/create-a/_components/SourcePicker.tsx
//
// The source TYPE selector — a single quiet trigger (icon + label + chevron)
// that opens a popover listing ALL eight sources as first-class rows. No tile
// grid hogging the page; the choice is one tap away and the composer below
// adapts to it. Every source is live here — no disabled / "soon" treatment.

import { ChevronDown, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SOURCE_OPTIONS } from "@/features/podcasts/generator/constants";
import type { PodcastSourceKind } from "@/features/podcasts/generator/types";

export function SourcePicker({
  value,
  onChange,
}: {
  value: PodcastSourceKind;
  onChange: (kind: PodcastSourceKind) => void;
}) {
  const active = SOURCE_OPTIONS.find((o) => o.kind === value)!;
  const ActiveIcon = active.icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <ActiveIcon className="h-3.5 w-3.5 text-primary" />
          <span>{active.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Start from
        </p>
        <div className="space-y-0.5">
          {SOURCE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = opt.kind === value;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() => onChange(opt.kind)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                  selected ? "bg-primary/10" : "hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {opt.label}
                    </span>
                    {selected && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {opt.helper}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
