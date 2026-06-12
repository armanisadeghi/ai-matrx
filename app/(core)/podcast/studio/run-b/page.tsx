"use client";

// run-b — redesigned generation / run page (static demo).
//
// On mount a mock event player streams realistic podcast events through the REAL
// reduce(), so the full ~45s production animation plays automatically. A Replay
// control re-runs it. Only the event SOURCE is mocked — the state model, stage
// kinds, and reveal logic are the real ones.
//
// Reference: Vercel's deployment build view (live step list + hero step) crossed
// with Midjourney's progressive asset reveal. Persona: a paying consumer
// watching their episode get built and wanting to feel it's alive.

import Link from "next/link";
import { ArrowLeft, Plus, RotateCcw, Podcast, CheckCircle2 } from "lucide-react";
import { useMockRun } from "./_mock/useMockRun";
import { ProgressTimeline } from "./_components/ProgressTimeline";
import { EpisodeReveal } from "./_components/EpisodeReveal";
import { StageLoaderKeyframes } from "./_components/StageLoaders";

export default function RunPageB() {
  const { state, startedAt, streaming, replay } = useMockRun();
  const done = state.status === "done";

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <StageLoaderKeyframes />
      <div className="mx-auto max-w-5xl px-4 py-6 pr-14 sm:py-8">
        {/* Top bar — back, title, and polished glass action buttons. */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/podcast/studio"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-glass-edge bg-glass text-muted-foreground shadow-glass backdrop-blur-glass transition-colors hover:bg-glass-hover hover:text-foreground"
            aria-label="Back to studio"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
            <Podcast className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
              {done ? "Episode ready" : "Producing your episode"}
              {done && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {done
                ? "Your two-host episode is fully produced."
                : "Hang tight — this usually takes a few minutes."}
            </p>
          </div>

          {/* Polished top actions: clean glass pills, not loud buttons. */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={replay}
              className="inline-flex items-center gap-1.5 rounded-full border border-glass-edge bg-glass px-3.5 py-2 text-sm font-medium text-foreground shadow-glass backdrop-blur-glass transition-colors hover:bg-glass-hover"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Replay</span>
            </button>
            <Link
              href="/podcast/studio/create-b"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New episode</span>
            </Link>
          </div>
        </div>

        {/* Two-column: results reveal on the left, live timeline on the right. */}
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="order-2 min-w-0 lg:order-1">
            <EpisodeReveal state={state} />
          </div>
          <div className="order-1 lg:order-2 lg:sticky lg:top-2 lg:self-start">
            <ProgressTimeline
              state={state}
              startedAt={startedAt}
              streaming={streaming}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
