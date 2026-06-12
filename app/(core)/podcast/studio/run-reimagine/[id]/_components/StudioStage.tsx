"use client";

// app/(core)/podcast/studio/run-reimagine/[id]/_components/StudioStage.tsx
//
// REIMAGINED run surface — the "Studio Stage".
//
// Reference model: a Spotify Now-Playing canvas + a broadcast control room. The
// original run page is a two-column dashboard (episode left, status/script
// right). This reframes the whole thing as ONE stage where the episode
// materializes in front of you: the cover-art canvas on the left IS the
// experience — it breathes while producing and becomes the album cover when done,
// with the player resolving into the same frame. The pipeline rides as a slim
// "control rail" beside it, then the script, source and post-creation toolkit
// reveal beneath.
//
// THIS IS REAL — and it PRESERVES OR BEATS the existing run experience.
// It consumes useStudioRun UNCHANGED: the live POST /podcast/generate stream,
// /podcast/resume, the 20s heartbeat/stall watchdog, background-poll on
// disconnect, recovery derivation, per-asset regenerate/add, cover selection.
// Every recovery / stall / never-dead-end state is surfaced via the same
// RunRecoveryBanner — no behavior is dropped, only re-presented.

import Link from "next/link";
import {
  Podcast,
  ArrowLeft,
  Plus,
  RefreshCw,
  BookOpen,
  Bookmark,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComingSoonCard } from "@/components/coming-soon/ComingSoonCard";
import { Skeleton } from "@/components/ui/skeleton";
import { MetadataHero } from "@/features/podcasts/generator/components/MetadataHero";
import { ProductionTeaser } from "@/features/podcasts/generator/components/ProductionTeaser";
import { MediaOptionsGrid } from "@/features/podcasts/generator/components/MediaOptionsGrid";
import { ResultActions } from "@/features/podcasts/generator/components/ResultActions";
import { TranscriptPanel } from "@/features/podcasts/generator/components/TranscriptPanel";
import { episodeHref } from "@/features/podcasts/generator/constants";
import { useStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";
import { RunRecoveryBanner } from "@/features/podcasts/studio/components/RunRecoveryBanner";
import { SourceSummaryPanel } from "@/features/podcasts/studio/components/SourceSummaryPanel";
import { StageCanvas } from "./StageCanvas";
import { ControlRail } from "./ControlRail";

export function StudioStage({ runId }: { runId: string }) {
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
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
          <Skeleton className="aspect-square w-full rounded-3xl" />
          <div className="space-y-4">
            <Skeleton className="h-9 w-3/4 rounded-lg" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
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
  const rtl = state.podcastType === "persian";

  const firstDoneImage =
    state.images.find((s) => s.status === "done" && s.url)?.url ?? null;
  const effectiveCover = selectedCoverUrl ?? firstDoneImage;
  const hasVideo = state.videos.some((s) => s.status === "done" && s.url);
  const publicLink = episodeHref(state.episodeSlug, state.episodeId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pr-14 sm:py-9">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/podcast/studio"
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Studio
          </Link>
          <h1 className="flex items-center gap-2 whitespace-nowrap text-2xl font-bold tracking-tight text-foreground">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
              <Podcast className="h-5 w-5" />
            </span>
            {isDone ? "Episode" : "Studio stage"}
          </h1>
        </div>
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
          <Button asChild variant="outline" className="gap-2">
            <Link href="/podcast/studio/create-reimagine">
              <Plus className="h-4 w-4" />
              New episode
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* LEFT — the living stage: cover canvas → album + player. Sticky so it
            stays in view while the (taller) detail column scrolls. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <StageCanvas
            state={state}
            startedAt={startedAt}
            streaming={streaming}
            coverUrl={effectiveCover}
          />
        </div>

        {/* RIGHT — identity, the control rail, then everything that reveals. */}
        <div className="min-w-0 space-y-6">
          <MetadataHero state={state} />

          {/* Pipeline control rail — the live drumbeat (preserves the stage
              timeline + honest progress + elapsed of the original rail). */}
          <ControlRail
            state={state}
            startedAt={startedAt}
            streaming={streaming}
          />

          {/* Never a dead end — same recovery surface, same behaviors. */}
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

          {/* While producing but the audio is the long pole and the player hasn't
              resolved yet, the canvas already shows the live teaser; on narrow
              screens where the canvas is short, keep the original teaser too only
              if there's no canvas teaser — handled inside StageCanvas. */}
          {!isDone && !streaming && state.title && !state.audioUrl && (
            <ProductionTeaser state={state} startedAt={startedAt} />
          )}

          {isDone && state.episodeId && (
            <ResultActions
              episodeId={state.episodeId}
              episodeSlug={state.episodeSlug}
              audioUrl={state.audioUrl}
              title={state.title}
              hasVideo={hasVideo}
            />
          )}

          {state.script && <TranscriptPanel script={state.script} rtl={rtl} />}

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

          {detail && <SourceSummaryPanel detail={detail} />}

          {isDone && (
            <div className="grid gap-4 sm:grid-cols-3">
              <ComingSoonCard
                icon={BookOpen}
                title="Blog post"
                description="Turn this episode into a polished, shareable article."
              />
              <ComingSoonCard
                icon={Bookmark}
                title="Chapter markers"
                description="Auto timestamps to jump to each topic."
              />
              <ComingSoonCard
                icon={ListChecks}
                title="Show notes"
                description="A structured summary with key points and links."
              />
            </div>
          )}

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
        </div>
      </div>
    </div>
  );
}
