"use client";

// app/(core)/podcast/studio/run-e/_components/RunConsole.tsx
//
// Redesigned generation-progress surface — variation E ("the Production Console").
//
// Modeled after: a CI/CD live-deploy log (Vercel / GitHub Actions) for the
// STAGE PIPELINE, fused with an Apple Music / Spotify "now playing" finale.
// Persona: consumer-creator who launched a 5–15 min generation and wants to
// (a) stay oriented on what's done / running / next, (b) watch the artifact
// take shape, and (c) land in a real player — not a results dump.
//
// Layout while RUNNING (desktop):
//   ┌─────── header: title · live progress bar · elapsed · replay ───────┐
//   ├──────────────┬─────────────────────────────────────────────────────┤
//   │ PIPELINE     │            STAGE MONITOR (what's happening now)       │
//   │ (stages      │   ───────────────────────────────────────────────    │
//   │  light up)   │            ASSET STRIP (assets land here)             │
//   └──────────────┴─────────────────────────────────────────────────────┘
//
// On COMPLETE the whole body swaps to <FinishedPlayer/> — a now-playing view.
//
// Demo: replays MOCK_EVENTS through the REAL reduce() over ~45s. No backend.

import Link from "next/link";
import { ArrowLeft, AudioLines, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMockRun } from "./useMockRun";
import { Pipeline } from "./Pipeline";
import { StageMonitor } from "./StageMonitor";
import { AssetStrip } from "./AssetStrip";
import { FinishedPlayer } from "./FinishedPlayer";
import { Elapsed } from "./Elapsed";
import "./console.css";

// Running layout switches between a stacked view (below lg) and a pipeline-rail
// + monitor view (lg+) via CSS breakpoints — no JS width branch, so there is no
// SSR/hydration flash and the 768–1024 zone never gets crushed.
export function RunConsole() {
  const { state, startedAt, replay } = useMockRun();
  const isDone = state.status === "done";
  const doneCount = state.stages.filter((s) => s.status === "done").length;
  const progress = Math.round(state.progress);

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-border bg-card/60 px-3 pr-14 backdrop-blur-sm sm:px-4">
        <div className="flex h-12 items-center gap-3">
          <Link
            href="/podcast/studio"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Back to studio"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <AudioLines className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold text-foreground">
              {isDone
                ? "Episode ready"
                : state.title || "Producing your episode"}
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {isDone ? (
                "All stages complete"
              ) : (
                <>
                  {doneCount} of {state.totalSteps || "…"} stages ·{" "}
                  <Elapsed startedAt={startedAt} /> elapsed
                </>
              )}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {isDone && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Produced in <Elapsed startedAt={startedAt} stopped />
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={replay}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {isDone ? "Replay" : "Restart demo"}
            </Button>
          </div>
        </div>

        {/* Live progress bar — only while running. */}
        {!isDone && (
          <div className="pb-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(4, progress)}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {isDone ? (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <FinishedPlayer state={state} />
        </div>
      ) : (
        <>
          {/* Stacked (below lg): monitor → assets → pipeline, single scroll. */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4 lg:hidden">
            <div className="h-72">
              <StageMonitor state={state} />
            </div>
            <Section title="Produced assets">
              <AssetStrip images={state.images} videos={state.videos} />
            </Section>
            <Section title="Pipeline">
              <Pipeline stages={state.stages} />
            </Section>
          </div>

          {/* Pipeline rail + monitor stack (lg+). */}
          <div className="hidden min-h-0 flex-1 lg:flex">
            <aside className="w-72 shrink-0 overflow-y-auto border-r border-border bg-card/40 p-4 scrollbar-thin">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pipeline
              </p>
              <Pipeline stages={state.stages} />
            </aside>

            <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4">
              <div className="min-h-0 flex-1">
                <StageMonitor state={state} />
              </div>
              <div className="shrink-0">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Produced assets
                </p>
                <AssetStrip images={state.images} videos={state.videos} />
              </div>
            </main>
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}
