"use client";

// app/(core)/podcast/studio/run-f/_components/ProductionBooth.tsx
//
// ── Variation F · Generation progress ───────────────────────────────────────
// Persona:   Consumer / prosumer creator (someone who just hit "Generate").
// Modeled after: a flight-/deploy-run tracker crossed with a streaming app's
//   "now playing" theater (think Vercel deploy run + Apple's generative
//   "creating…" stage). NOT a CI log. The wait is reframed as a live
//   production booth where you watch your episode being made, act by act, with
//   real partial results landing as they finish — then it resolves into a
//   finished episode you can play.
//
// Self-contained demo: replays the mock event sequence over ~45s through a pure
// reducer. No backend, no [id] segment.

import Link from "next/link";
import { ArrowLeft, Radio, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBoothReplay } from "./useBoothReplay";
import { ActRail } from "./ActRail";
import { BoothStage } from "./BoothStage";
import { AssetGallery } from "./AssetGallery";
import { FinishedEpisode } from "./FinishedEpisode";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function ProductionBooth() {
  const { state, elapsed, restart } = useBoothReplay();
  const done = state.status === "done";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 pr-14 sm:py-7">
      {/* Top bar */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link
          href="/podcast/studio"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Studio
        </Link>

        {!done && (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-glass px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur-glass">
              <Clock className="h-3.5 w-3.5" />
              {fmt(elapsed)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              Live
            </span>
          </div>
        )}
      </div>

      {done ? (
        <FinishedEpisode state={state} onRunAgain={restart} />
      ) : (
        <>
          {/* Header: title-once-known + honest progress meter */}
          <div className="mb-6">
            <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
              {state.title || "Producing your episode"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.title
                ? "Hang tight — the studio is finishing the last few steps."
                : "Sit back. We're turning your source into a fully produced episode."}
            </p>

            <div className="mt-4 flex items-center gap-3">
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-700 ease-out",
                  )}
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                {state.progress}%
              </span>
            </div>
          </div>

          {/* Two-column booth: act rail + live stage. Stacks on mobile. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <div className="rounded-2xl border border-border bg-card p-4">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Production stages
                </h2>
                <ActRail state={state} />
              </div>
            </aside>

            <div className="space-y-5">
              <BoothStage state={state} />
              <AssetGallery state={state} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
