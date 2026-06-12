"use client";

// app/(core)/podcast/studio/run-d/_components/RunView.tsx
//
// STUDIO D — Generation progress surface.
// Reference: a CI/deploy build view (Vercel) × a render-farm export, resolving
// into a Spotify episode page. Persona: consumer / prosumer creator.
//
// While running: a two-pane "control room" — the production pipeline reactor on
// the left, assets materializing on the stage on the right, with a sticky status
// bar (live headline, honest %, elapsed clock). On complete it dissolves into
// the finished episode release card. Self-contained: replays MOCK_EVENTS through
// the real reducer over ~45s. No backend.

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Mic, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./studio-d.css";
import { useMockRun } from "./useMockRun";
import { PipelineRail } from "./PipelineRail";
import { AssetStage } from "./AssetStage";
import { FinishedEpisode } from "./FinishedEpisode";
import { buildPhases, liveHeadline, PHASES } from "./phases";

export function RunView() {
  const { state, elapsedMs, startedAt, stageDoneAt, stageStartedAt, replay } =
    useMockRun();
  const phases = buildPhases(state);
  const done = state.status === "done";
  // A render-stable "now" derived from the elapsed clock — never Date.now() in
  // render (impure). Drives the live duration of the currently-running phase.
  const now = startedAt + elapsedMs;

  // Per-phase timing text for the rail (duration if finished, live if active).
  const timings = useMemo(() => {
    const out: Record<string, string> = {};
    for (const def of PHASES) {
      const keys = state.stages
        .filter((s) => def.match(s.stage))
        .map((s) => s.stage);
      if (keys.length === 0) continue;
      const starts = keys
        .map((k) => stageStartedAt[k])
        .filter(Boolean) as number[];
      if (starts.length === 0) continue;
      const start = Math.min(...starts);
      const ends = keys.map((k) => stageDoneAt[k]).filter(Boolean) as number[];
      const allDone = state.stages
        .filter((s) => def.match(s.stage))
        .every((s) => s.status !== "running");
      const end = allDone && ends.length ? Math.max(...ends) : now;
      out[def.id] = `${((end - start) / 1000).toFixed(1)}s`;
    }
    return out;
  }, [state.stages, stageStartedAt, stageDoneAt, now]);

  const headline = liveHeadline(state);
  const elapsedLabel = fmtClock(elapsedMs);

  return (
    <div className="flex h-full flex-col bg-textured">
      {/* ── Sticky status bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-6xl px-4 pr-14 sm:px-6">
          <div className="flex h-14 items-center gap-3">
            <Link
              href="/podcast/studio"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Studio</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                done
                  ? "bg-success/15 text-success"
                  : "bg-primary/10 text-primary",
              )}
            >
              {done ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {headline}
              </div>
            </div>
            {!done && (
              <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                {elapsedLabel}
              </span>
            )}
            {done && (
              <Button
                variant="outline"
                size="sm"
                onClick={replay}
                className="shrink-0 gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Replay demo
              </Button>
            )}
          </div>

          {/* Honest progress bar */}
          {!done && (
            <div className="pb-2.5">
              <div className="flex items-center justify-between pb-1 text-[11px] font-medium text-muted-foreground">
                <span>{state.progress}% complete</span>
                <span className="font-mono sm:hidden">{elapsedLabel}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(4, state.progress)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          {done ? (
            <div className="sd-pop mx-auto max-w-3xl">
              <FinishedEpisode state={state} />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
              {/* Pipeline reactor */}
              <aside className="lg:sticky lg:top-[5.5rem] lg:self-start">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                      Production pipeline
                    </h2>
                    <span className="font-mono text-xs text-muted-foreground">
                      {phases.filter((p) => p.status === "done").length}/
                      {phases.length}
                    </span>
                  </div>
                  <PipelineRail phases={phases} timings={timings} />
                </div>
              </aside>

              {/* Live asset stage */}
              <main>
                <AssetStage state={state} />
              </main>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
