"use client";

// app/(core)/podcast/studio/run-a/_components/RunViewA.tsx
//
// Redesigned run / generation view (variation A — "lean").
//
// Modeled after: Vercel's deployment build view crossed with a render-farm /
// Runway export screen — a creator watching a long job, wanting to KNOW what's
// happening and to see results land, not stare at a spinner.
//
// Design moves vs. the current run page:
//   • Streamed info used far better: a "now running" hero featuring the live
//     stage with its big animated loader + a one-line "what's next", the title
//     and description revealed the instant metadata arrives, and an asset
//     gallery that fills in as covers/video land. Never a blank screen.
//   • Every name is humanized via the event `label` (the reducer carries it) —
//     no machine keys with underscores.
//   • Unique ANIMATED loader per kind (StageLoader): research scans, script
//     writes, audio pulses, image develops, video reels.
//   • Coloring fix: a DONE step is an accent icon on a TRANSPARENT background
//     (with a tiny corner check) — no misplaced colored chip.
//   • Polished top bar: a single clean header row with a back affordance and
//     tidy ghost/outline actions; Replay is a first-class control.

import Link from "next/link";
import {
  ArrowLeft,
  Podcast,
  RotateCcw,
  Plus,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stageKind } from "@/features/podcasts/generator/constants";
import { useMockRun } from "./useMockRun";
import { StageLoader } from "./StageLoader";
import { StageTimeline } from "./StageTimeline";
import { AssetGallery } from "./AssetGallery";
import { Elapsed } from "./Elapsed";
import "./loaders.css";

export function RunViewA() {
  const { state, startedAt, replay } = useMockRun();

  const running = state.status === "running";
  const done = state.status === "done";
  const total = state.totalSteps || state.stages.length || 1;
  const doneCount = state.stages.filter((s) => s.status !== "running").length;
  const featured = state.stages.find((s) => s.status === "running") ?? null;
  const featuredKind = featured ? stageKind(featured.stage) : "other";

  // Sibling stages running concurrently with the featured one (e.g. the two
  // cover images render in parallel). Future stages aren't in state until they
  // start, so this is an honest "also happening" hint — not a fake lookahead.
  const alsoRunning = featured
    ? state.stages.filter(
        (s) => s.status === "running" && s.stage !== featured.stage,
      )
    : [];
  const alsoLabel =
    alsoRunning.length === 1
      ? alsoRunning[0].label
      : alsoRunning.length > 1
        ? `${alsoRunning.length} more steps`
        : null;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-5 sm:pt-7">
      {/* ── Polished top bar ─────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-3 pr-14">
        <Link
          href="/podcast/studio"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to studio"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Podcast className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {done ? "Episode ready" : "Producing your episode"}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={replay}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Replay</span>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/podcast/studio/create-a">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New episode</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Now-running hero / completion banner ──────────────────────────── */}
      <div
        className={cn(
          "mb-5 overflow-hidden rounded-2xl border border-glass-edge bg-glass shadow-glass backdrop-blur-glass backdrop-saturate-glass",
        )}
      >
        <div className="flex items-center gap-4 p-4 sm:p-5">
          {done ? (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" />
            </span>
          ) : featured ? (
            <StageLoader kind={featuredKind} status="running" size="lg" />
          ) : (
            <StageLoader kind="other" status="running" size="lg" />
          )}

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {running && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
              {done ? "Complete" : "Live"}
            </p>
            <p className="truncate text-base font-semibold text-foreground">
              {done
                ? state.title || "Your episode is ready"
                : (featured?.label ?? (state.currentLabel || "Starting up…"))}
            </p>
            {!done && alsoLabel && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Also running · {alsoLabel}
              </p>
            )}
          </div>

          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold tabular-nums text-foreground">
              {Math.round(state.progress)}%
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              <Elapsed startedAt={startedAt} running={running} />
            </div>
          </div>
        </div>

        {/* progress bar */}
        <div className="h-1 w-full bg-muted/60">
          <div
            className={cn(
              "h-full rounded-r-full transition-[width] duration-500 ease-out",
              done
                ? "bg-emerald-500"
                : "bg-gradient-to-r from-primary to-secondary",
            )}
            style={{ width: `${Math.min(100, Math.max(3, state.progress))}%` }}
          />
        </div>
      </div>

      {/* ── Two columns: deliverables (left) · pipeline (right) ───────────── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* LEFT — the episode as it forms. */}
        <div className="order-2 min-w-0 space-y-5 lg:order-1">
          {/* Metadata — revealed the moment it streams. */}
          {state.title ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm duration-500 animate-in fade-in slide-in-from-bottom-2">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                Episode
              </p>
              <h2 className="text-lg font-bold leading-snug text-foreground">
                {state.title}
              </h2>
              {state.description && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {state.description}
                </p>
              )}
            </div>
          ) : (
            <MetaPlaceholder />
          )}

          {/* Audio — the finished player area. */}
          {state.audioUrl && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm duration-500 animate-in fade-in">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Audio
              </p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- demo placeholder audio */}
              <audio controls src={state.audioUrl} className="w-full" />
            </div>
          )}

          {/* Assets — fill in as they land. */}
          {(state.images.length > 0 || state.videos.length > 0) && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <AssetGallery images={state.images} videos={state.videos} />
            </div>
          )}

          {/* Script preview while it streams; full transcript when done. */}
          {(state.scriptPreview || state.script) && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {state.script ? "Transcript" : "Script preview"}
              </p>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90 scrollbar-thin">
                {state.script || state.scriptPreview}
              </pre>
            </div>
          )}

          {done && (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild className="gap-2">
                <Link href="/podcast/crispr-explained">
                  <Podcast className="h-4 w-4" />
                  Open the episode
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link href="/podcast/studio/create-a">
                  <Plus className="h-4 w-4" />
                  Make another
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT — the pipeline timeline. */}
        <div className="order-1 lg:order-2">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Pipeline</p>
              <span className="text-xs text-muted-foreground">
                {doneCount} of {total} steps
              </span>
            </div>
            {state.stages.length > 0 ? (
              <StageTimeline stages={state.stages} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Warming up the studio…
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A quiet skeleton for the episode card before metadata arrives. */
function MetaPlaceholder() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 h-2.5 w-16 rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-muted/70" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Title and description will appear here as they&apos;re generated…
      </p>
    </div>
  );
}
