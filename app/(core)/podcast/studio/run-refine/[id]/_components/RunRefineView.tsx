"use client";

// app/(core)/podcast/studio/run-refine/[id]/_components/RunRefineView.tsx
//
// ui-refine run surface. This page was already "nearly perfect" — so we KEEP its
// structure and mental model (status hero on top, the episode on the left, the
// live console + script + source on the right) and raise the bar on ANIMATION
// and engagement, exactly as the brief asks:
//
//   • Show what we HAVE, not what we don't: ready covers animate into a rotating
//     showcase (ProductionStage) instead of a static "waiting" placeholder.
//   • Don't let the user get bored: during the long audio render, a BUFFERED
//     teaser (useTeaserBuffer) drips real arrivals — covers, clips, script turns,
//     finished steps — one at a time so the tricks never run out early.
//   • Show how hard we're working: a live "production pulse" strip surfaces the
//     running/done step counts with a custom sheen + waveform loaders.
//
// REAL wiring (unchanged): every byte of state comes from useStudioRun(runId) —
// the live POST /podcast/generate stream, /podcast/resume recovery, the 20s
// heartbeat/stall watchdog, background-poll-on-disconnect, and the derived
// recovery state. We render that state; we never reimplement it. Every proven
// presentation piece (hero, audio player, live rail, media grid, result actions,
// transcript, source, recovery banner) is reused as-is.

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
  Activity,
  ImageIcon,
  Clapperboard,
  AudioLines,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComingSoonCard } from "@/components/coming-soon/ComingSoonCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { MetadataHero } from "@/features/podcasts/generator/components/MetadataHero";
import { LiveProgressRail } from "@/features/podcasts/generator/components/LiveProgressRail";
import { MediaOptionsGrid } from "@/features/podcasts/generator/components/MediaOptionsGrid";
import { ResultActions } from "@/features/podcasts/generator/components/ResultActions";
import { TranscriptPanel } from "@/features/podcasts/generator/components/TranscriptPanel";
import { ElapsedTimer } from "@/features/podcasts/generator/components/ElapsedTimer";
import { episodeHref } from "@/features/podcasts/generator/constants";
import { useStageDisplay } from "@/features/podcasts/generator/useStageDisplay";
import { useStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";
import { RunRecoveryBanner } from "@/features/podcasts/studio/components/RunRecoveryBanner";
import { SourceSummaryPanel } from "@/features/podcasts/studio/components/SourceSummaryPanel";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { ProductionStage } from "./ProductionStage";
import "./refine.css";

// ── Status hero ──────────────────────────────────────────────────────────────

type HeroTone = "building" | "ready" | "failed" | "stalled" | "background";

interface HeroSpec {
  tone: HeroTone;
  icon: LucideIcon;
  label: string;
  sub: string;
  accent: string;
  chip: string;
  ring: string;
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
    <div className="pcr pcr-card-in relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
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
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {spec.sub}
          </p>
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

// ── Production pulse — "show how hard we're working" ─────────────────────────
// A compact live strip over the console: running step count, done count, and how
// many covers/clips have landed — each with a count-up bump. Derives from the
// same stage display the rail uses, so it never drifts from the timeline.

function ProductionPulse({ state }: { state: PodcastRunState }) {
  const { doneCount, total, featuredLabel } = useStageDisplay(state);
  const coversReady = state.images.filter((s) => s.status === "done").length;
  const clipsReady = state.videos.filter((s) => s.status === "done").length;
  const audioWorking = !state.audioUrl;

  return (
    <div className="pcr pcr-sheen relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 shadow-sm">
      <div className="relative z-10 flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Activity className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {featuredLabel}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {doneCount} of {total} steps done — working across audio, art and
            video at once.
          </p>
        </div>
      </div>
      <div className="relative z-10 mt-3 grid grid-cols-3 gap-2">
        <PulseStat
          icon={AudioLines}
          label="Audio"
          value={audioWorking ? "Rendering" : "Ready"}
          active={audioWorking}
        />
        <PulseStat
          icon={ImageIcon}
          label="Covers"
          value={`${coversReady}/${Math.max(state.images.length, 5)}`}
          active={coversReady < Math.max(state.images.length, 5)}
        />
        <PulseStat
          icon={Clapperboard}
          label="Clips"
          value={`${clipsReady}/${Math.max(state.videos.length, 2)}`}
          active={clipsReady < Math.max(state.videos.length, 2)}
        />
      </div>
    </div>
  );
}

function PulseStat({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/70 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon
          className={cn("h-3 w-3", active ? "text-primary" : "text-emerald-500")}
        />
        {label}
      </div>
      <div
        key={value}
        className={cn(
          "pcr-bump mt-0.5 text-sm font-semibold tabular-nums",
          active ? "text-foreground" : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function RunRefineView({ runId }: { runId: string }) {
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

  const spec = heroSpec({ isDone, isError, streaming, stalled, backgroundWorking });
  const showHero = !isDone || streaming;
  // The production pulse belongs to the active stream while the long audio step
  // is still in flight — that's the engagement-critical window.
  const showPulse = streaming && !isDone && !isError && !stalled;

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
            <Link href="/podcast/studio/create-refine">
              <Plus className="h-4 w-4" />
              New episode
            </Link>
          </Button>
        </div>
      </header>

      {showHero && (
        <div className="mb-6">
          <StatusHero spec={spec} startedAt={startedAt} running={streaming} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — the episode: identity, audio (or the live production stage),
            then the visual options. */}
        <div className="order-1 min-w-0 space-y-6">
          <MetadataHero state={state} />

          {state.audioUrl ? (
            <div
              className={cn(
                "pcr pcr-card-in rounded-2xl border bg-card p-5 shadow-sm",
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
          ) : streaming ? (
            <ProductionStage state={state} startedAt={startedAt} />
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

        {/* RIGHT — the console: recovery first (loudest), the production pulse,
            the steps, then script, source, and details. */}
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

          {showPulse && <ProductionPulse state={state} />}

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

          {/* Never a blank column in the first seconds before stages arrive. */}
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
