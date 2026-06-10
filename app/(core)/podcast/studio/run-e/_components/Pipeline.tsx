"use client";

// app/(core)/podcast/studio/run-e/_components/Pipeline.tsx
//
// The left rail — a vertical pipeline of production stages that light up in
// order (the Vercel/GitHub-Actions live-deploy log pattern, given a colorful
// per-stage identity). Each stage shows: a kind-colored node (pending /
// running / done / failed), its humanized label, and a connecting spine.

import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  stageKind,
  STAGE_KIND_ICON,
  STAGE_KIND_COLOR,
} from "@/features/podcasts/generator/constants";
import type { StageRow } from "@/features/podcasts/generator/types";

export function Pipeline({ stages }: { stages: StageRow[] }) {
  if (stages.length === 0) {
    // Pre-first-event skeleton: show the spine warming up.
    return (
      <ol className="space-y-1">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3 px-1 py-2">
            <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
            <span className="h-3 w-32 animate-pulse rounded bg-muted" />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="relative">
      {stages.map((s, i) => {
        const kind = stageKind(s.stage);
        const Icon = STAGE_KIND_ICON[kind];
        const color = STAGE_KIND_COLOR[kind];
        const isLast = i === stages.length - 1;
        const running = s.status === "running";
        const done = s.status === "done";
        const failed = s.status === "failed";

        return (
          <li key={s.stage} className="relative flex gap-3 pb-1.5">
            {/* Spine */}
            {!isLast && (
              <span
                className={cn(
                  "absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-px",
                  done ? "bg-primary/30" : "bg-border",
                )}
              />
            )}

            {/* Node */}
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                done && "border-transparent bg-primary/10",
                running && cn("border-transparent", color.bg),
                failed && "border-transparent bg-destructive/10",
                !done && !running && !failed && "border-border bg-card",
              )}
            >
              {done ? (
                <Check className="h-4 w-4 text-primary" />
              ) : failed ? (
                <X className="h-4 w-4 text-destructive" />
              ) : running ? (
                <Loader2 className={cn("h-4 w-4 animate-spin", color.text)} />
              ) : (
                <Icon className="h-4 w-4 text-muted-foreground" />
              )}
            </span>

            {/* Label */}
            <div className="min-w-0 flex-1 pt-1">
              <p
                className={cn(
                  "truncate text-sm leading-tight",
                  running
                    ? "font-medium text-foreground"
                    : done
                      ? "text-foreground"
                      : failed
                        ? "text-destructive"
                        : "text-muted-foreground",
                )}
              >
                {s.label}
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {running
                  ? "In progress…"
                  : done
                    ? "Done"
                    : failed
                      ? "Failed"
                      : "Queued"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
