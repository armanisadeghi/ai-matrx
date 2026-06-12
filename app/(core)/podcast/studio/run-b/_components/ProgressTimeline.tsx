"use client";

// run-b — the redesigned live progress timeline.
//
// Reference: Vercel's deployment build view. A featured "now running" hero row
// at the top (big animated loader + the human label + elapsed), a thin progress
// bar, then the full step list where each row uses its own per-kind animated
// loader. Done rows use the transparent accent treatment (no solid chip).
//
// All labels are humanized — we render the event `label`, falling back to
// STAGE_FALLBACK_LABELS, never a raw `create_script`-style machine name.

import { cn } from "@/lib/utils";
import {
  stageKind,
  STAGE_FALLBACK_LABELS,
} from "@/features/podcasts/generator/constants";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { ElapsedTimer } from "@/features/podcasts/generator/components/ElapsedTimer";
import { StageLoader } from "./StageLoaders";

function humanLabel(stage: string, label: string): string {
  if (label && !/_/.test(label)) return label;
  return STAGE_FALLBACK_LABELS[stage] ?? label ?? stage;
}

export function ProgressTimeline({
  state,
  startedAt,
  streaming,
}: {
  state: PodcastRunState;
  startedAt: number | null;
  streaming: boolean;
}) {
  const running = state.status === "running";
  const done = state.status === "done";

  const total = Math.max(state.stages.length, state.totalSteps, 1);
  const completed = state.stages.filter((s) => s.status === "done").length;

  // The featured step: the first currently-running stage, else the last touched.
  const featured =
    state.stages.find((s) => s.status === "running") ??
    state.stages[state.stages.length - 1];
  const featuredKind = featured ? stageKind(featured.stage) : "other";
  const featuredLabel = done
    ? "Episode ready"
    : featured
      ? humanLabel(featured.stage, featured.label)
      : "Starting up…";

  return (
    <div className="overflow-hidden rounded-2xl border border-glass-edge bg-glass shadow-glass backdrop-blur-glass backdrop-saturate-glass">
      {/* Hero — the step happening right now. */}
      <div className="flex items-center gap-3.5 p-4">
        <StageLoader
          kind={featuredKind}
          status={done ? "done" : "running"}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {running && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {done ? "Complete" : running ? "Live" : "Working"}
            </span>
          </div>
          <div className="truncate text-base font-semibold text-foreground">
            {featuredLabel}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold tabular-nums text-foreground">
            {Math.round(state.progress)}%
          </div>
          <ElapsedTimer
            startedAt={startedAt}
            running={streaming}
            className="text-xs tabular-nums text-muted-foreground"
          />
        </div>
      </div>

      {/* Progress bar. */}
      <div className="px-4 pb-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out",
              state.status === "error"
                ? "bg-destructive"
                : "bg-gradient-to-r from-primary via-primary to-secondary",
            )}
            style={{ width: `${Math.min(100, Math.max(3, state.progress))}%` }}
          />
        </div>
      </div>

      {/* The step list. */}
      <div className="border-t border-border/60 px-2 py-2">
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Production steps
          </span>
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {completed} / {total} done
          </span>
        </div>
        <ul className="space-y-0.5">
          {state.stages.map((s) => {
            const kind = stageKind(s.stage);
            return (
              <li
                key={s.stage}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors",
                  s.status === "running" && "bg-accent/40",
                )}
              >
                <StageLoader kind={kind} status={s.status} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    s.status === "running"
                      ? "font-medium text-foreground"
                      : s.status === "failed"
                        ? "text-destructive/80"
                        : "text-muted-foreground",
                  )}
                >
                  {humanLabel(s.stage, s.label)}
                </span>
                {s.status === "running" && (
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary">
                    Running
                  </span>
                )}
              </li>
            );
          })}
          {state.stages.length === 0 && (
            <li className="px-2 py-3 text-sm text-muted-foreground">
              Spinning up the production pipeline…
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
