"use client";

// app/(core)/podcast/studio/run-sharp/[id]/_components/RunSharpView.tsx
//
// ui-sharp run surface. Modeled after Vercel's deployment / build screen: a
// strong status HERO sits at the top (building → ready → failed), a clean
// console reveals the work as it streams, and the finished episode resolves into
// a polished artifact. Calm while it works, celebratory when it lands, never a
// dead end when it doesn't.
//
// REAL wiring (unchanged): every byte of state comes from useStudioRun(runId) —
// the live POST /podcast/generate stream, /podcast/resume recovery, the 20s
// heartbeat/stall watchdog, background-poll-on-disconnect, and the derived
// recovery state. We render that state; we do not reimplement it. Every proven,
// already-wired presentation piece (hero, audio player, live rail, teaser, media
// grid, result actions, transcript, source, recovery banner) is reused as-is —
// our value is the SHELL and the status framing around them.

import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  BookOpen,
  Bookmark,
  ListChecks,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  WifiOff,
  Podcast,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComingSoonCard } from "@/components/coming-soon/ComingSoonCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { MetadataHero } from "@/features/podcasts/generator/components/MetadataHero";
import { LiveProgressRail } from "@/features/podcasts/generator/components/LiveProgressRail";
import { ProductionTeaser } from "@/features/podcasts/generator/components/ProductionTeaser";
import { MediaOptionsGrid } from "@/features/podcasts/generator/components/MediaOptionsGrid";
import { ResultActions } from "@/features/podcasts/generator/components/ResultActions";
import { TranscriptPanel } from "@/features/podcasts/generator/components/TranscriptPanel";
import { ElapsedTimer } from "@/features/podcasts/generator/components/ElapsedTimer";
import { episodeHref } from "@/features/podcasts/generator/constants";
import { useStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";
import { RunRecoveryBanner } from "@/features/podcasts/studio/components/RunRecoveryBanner";
import { SourceSummaryPanel } from "@/features/podcasts/studio/components/SourceSummaryPanel";

// ── Status hero ─────────────────────────────────────────────────────────────
// The Vercel-build header: one glance tells you where the run stands. It owns
// the dominant accent and the elapsed clock; the LiveProgressRail below it owns
// the per-stage detail.

type HeroTone = "building" | "ready" | "failed" | "stalled" | "background";

interface HeroSpec {
  tone: HeroTone;
  icon: LucideIcon;
  label: string;
  sub: string;
  accent: string; // text + icon color
  chip: string; // chip bg/border
  ring: string; // left accent rail
}

function heroSpec(args: {
  isDone: boolean;
  isError: boolean;
  streaming: boolean;
  stalled: boolean;
  backgroundWorking: boolean;
}): HeroSpec {
  const { isDone, isError, streaming, stalled, backgroundWorking } = args;
  if (isDone)
    return {
      tone: "ready",
      icon: CheckCircle2,
      label: "Episode ready",
      sub: "Your two-host episode is produced and saved.",
      accent: "text-emerald-600 dark:text-emerald-400",
      chip: "bg-emerald-500/10 border-emerald-500/30",
      ring: "bg-emerald-500",
    };
  if (isError)
    return {
      tone: "failed",
      icon: AlertTriangle,
      label: "Finished with errors",
      sub: "Nothing finished is lost — resume from the failed step or re-run.",
      accent: "text-destructive",
      chip: "bg-destructive/10 border-destructive/30",
      ring: "bg-destructive",
    };
  if (streaming && stalled)
    return {
      tone: "stalled",
      icon: WifiOff,
      label: "Connection went quiet",
      sub: "We stopped waiting on stalled steps — finished work is saved.",
      accent: "text-amber-600 dark:text-amber-500",
      chip: "bg-amber-500/10 border-amber-500/30",
      ring: "bg-amber-500",
    };
  if (backgroundWorking)
    return {
      tone: "background",
      icon: Loader2,
      label: "Producing in the background",
      sub: "You can leave — it keeps going and this page updates automatically.",
      accent: "text-sky-600 dark:text-sky-400",
      chip: "bg-sky-500/10 border-sky-500/30",
      ring: "bg-sky-500",
    };
  return {
    tone: "building",
    icon: Loader2,
    label: "In the studio",
    sub: "Writing the script, recording the hosts, designing the visuals.",
    accent: "text-primary",
    chip: "bg-primary/10 border-primary/30",
    ring: "bg-gradient-to-b from-primary to-secondary",
  };
}

function StatusHero({
  spec,
  startedAt,
  running,
}: {
  spec: HeroSpec;
  startedAt: number | null;
  running: boolean;
}) {
  const Icon = spec.icon;
  const spin = spec.tone === "building" || spec.tone === "background";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Left accent rail — the build-status color stripe. */}
      <span className={cn("absolute inset-y-0 left-0 w-1", spec.ring)} />
      <div className="flex items-center gap-3.5 p-4 pl-5 sm:p-5 sm:pl-6">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
            spec.chip,
          )}
        >
          <Icon className={cn("h-5 w-5", spec.accent, spin && "animate-spin")} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className={cn("truncate text-base font-semibold", spec.accent)}>
              {spec.label}
            </h2>
            {spec.tone === "building" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Live
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{spec.sub}</p>
        </div>
        {startedAt != null && (
          <span className="shrink-0 self-start rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
            <ElapsedTimer startedAt={startedAt} running={running} />
          </span>
        )}
      </div>
    </div>
  );
}

export function RunSharpView({ runId }: { runId: string }) {
  const {
    state,
    startedAt,
    loading,
    notFound,
    streaming,
    stalled,
    backgroundWorking,
    canReconnect,
    reconnect,
    rerunFromSource,
    refresh,
    detail,
    recovery,
    assetBusy,
    regenerateAsset,
    addAsset,
    selectedCoverUrl,
    selectCover,
  } = useStudioRun(runId);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <Skeleton className="mb-5 h-7 w-48" />
        <Skeleton className="mb-6 h-20 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Podcast className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">Run not found</h1>
        <p className="text-sm text-muted-foreground">
          This studio run doesn&apos;t exist or isn&apos;t yours.
        </p>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/podcast/studio">
            <ArrowLeft className="h-4 w-4" />
            Back to studio
          </Link>
        </Button>
      </div>
    );
  }

  const isDone = state.status === "done";
  const isRunning = state.status === "running";
  const isError = state.status === "error";
  const rtl = state.podcastType === "persian";

  const firstDoneImage =
    state.images.find((s) => s.status === "done" && s.url)?.url ?? null;
  const effectiveCover = selectedCoverUrl ?? firstDoneImage;
  const hasVideo = state.videos.some((s) => s.status === "done" && s.url);
  const hasStages = state.stages.length > 0;
  const publicLink = episodeHref(state.episodeSlug, state.episodeId);

  // The hero is the run's state; show it whenever the run isn't a quiet,
  // fully-finished artifact already crowned by its own player + actions. Done
  // runs lead with the episode itself, so the hero only persists for the active
  // / interrupted / failed states.
  const spec = heroSpec({ isDone, isError, streaming, stalled, backgroundWorking });
  const showHero = !isDone || streaming;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      {/* Sticky header — back, refresh, new. */}
      <header className="sticky top-0 z-10 -mx-4 mb-5 flex items-center justify-between gap-3 border-b border-border/60 bg-textured/80 px-4 pb-3 pt-5 backdrop-blur-glass backdrop-saturate-glass">
        <Link
          href="/podcast/studio"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Studio
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            className="gap-1.5 text-muted-foreground"
            title="Re-sync this run from the server"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/podcast/studio/create-sharp">
              <Plus className="h-4 w-4" />
              New episode
            </Link>
          </Button>
        </div>
      </header>

      {/* The status hero — the build header. */}
      {showHero && (
        <div className="mb-6">
          <StatusHero spec={spec} startedAt={startedAt} running={streaming} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — the episode: identity, audio, then the visual options. */}
        <div className="order-1 min-w-0 space-y-6">
          <MetadataHero state={state} />

          {/* Audio: the finished player, or the live teaser while it renders. */}
          {state.audioUrl ? (
            <div
              className={cn(
                "rounded-2xl border bg-card p-5 shadow-sm",
                isDone
                  ? "border-emerald-500/30 ring-1 ring-emerald-500/10"
                  : "border-border",
              )}
            >
              <PodcastAudioPlayer
                audioUrl={state.audioUrl}
                title={state.title}
                coverImageUrl={effectiveCover ?? undefined}
              />
            </div>
          ) : streaming && state.title ? (
            <ProductionTeaser state={state} startedAt={startedAt} />
          ) : null}

          {isDone && state.episodeId && (
            <ResultActions
              episodeId={state.episodeId}
              episodeSlug={state.episodeSlug}
              audioUrl={state.audioUrl}
              title={state.title}
              hasVideo={hasVideo}
            />
          )}

          {isDone && (
            <ComingSoonCard
              icon={BookOpen}
              title="Blog post"
              description="Turn this episode into a polished, shareable article — generated from the same script."
            />
          )}

          <MediaOptionsGrid
            state={state}
            interactive={isDone && !!state.episodeId}
            selectedCoverUrl={effectiveCover}
            onSelectCover={selectCover}
            onRegenerate={!streaming ? regenerateAsset : undefined}
            onAddAsset={!streaming ? addAsset : undefined}
            assetBusy={assetBusy}
            modelCounts={detail?.model_counts}
          />

          {isDone && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ComingSoonCard
                icon={Bookmark}
                title="Chapter markers"
                description="Auto-generated timestamps that let listeners jump to each topic."
              />
              <ComingSoonCard
                icon={ListChecks}
                title="Show notes"
                description="A structured summary with key points, links, and references."
              />
            </div>
          )}
        </div>

        {/* RIGHT — the console: recovery first (loudest), steps, then script,
            source, and details. */}
        <div className="order-2 space-y-4">
          <RunRecoveryBanner
            status={state.status}
            streaming={streaming}
            stalled={stalled}
            backgroundWorking={backgroundWorking}
            canReconnect={canReconnect}
            canRerun={recovery.canRerun}
            error={state.error}
            onResume={reconnect}
            onRerun={rerunFromSource}
          />

          {hasStages && <LiveProgressRail state={state} startedAt={startedAt} />}

          {state.script && <TranscriptPanel script={state.script} rtl={rtl} />}

          {detail && <SourceSummaryPanel detail={detail} />}

          {isDone && (state.episodeId || publicLink) && (
            <details className="group rounded-2xl border border-border bg-card/40 p-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer list-none font-medium text-foreground/70">
                Episode details
              </summary>
              <div className="mt-2 space-y-1.5">
                {state.episodeId && (
                  <p className="break-all">
                    <span className="font-medium text-foreground/70">
                      Episode ID:
                    </span>{" "}
                    {state.episodeId}
                  </p>
                )}
                {publicLink && (
                  <p>
                    <span className="font-medium text-foreground/70">
                      Public link:
                    </span>{" "}
                    <Link
                      href={publicLink}
                      className="text-primary hover:underline"
                    >
                      {publicLink}
                    </Link>
                  </p>
                )}
              </div>
            </details>
          )}

          {/* Quiet status line while running but no stages yet (the very first
              seconds, before the first stage_started). Never a blank column. */}
          {isRunning && !hasStages && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Warming up the studio…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
