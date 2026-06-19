"use client";

// features/podcasts/studio/components/StudioRunView.tsx
//
// The persistent run page (/podcast/studio/run/[id]). Streams live when reached
// from the create form, and rebuilds the full studio view from the saved row on
// any later return — hero, audio, every cover/video option, transcript, and the
// post-creation toolkit. A creation is never lost again.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Podcast,
  ArrowLeft,
  Plus,
  RefreshCw,
  Bookmark,
  Clapperboard,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineMediaRef } from "@/features/files";
import { podcastMediaRef } from "@/features/podcasts/generator/media";
import { ComingSoonCard } from "@/components/coming-soon/ComingSoonCard";
import { EpisodeContentStudio } from "@/features/podcasts/studio/components/EpisodeContentStudio";
import { Skeleton } from "@/components/ui/skeleton";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { LiveAudioPlayer } from "@/features/podcasts/generator/components/LiveAudioPlayer";
import { MetadataHero } from "@/features/podcasts/generator/components/MetadataHero";
import { LiveProgressRail } from "@/features/podcasts/generator/components/LiveProgressRail";
import { ProductionTeaser } from "@/features/podcasts/generator/components/ProductionTeaser";
import { MediaOptionsGrid } from "@/features/podcasts/generator/components/MediaOptionsGrid";
import { ResultActions } from "@/features/podcasts/generator/components/ResultActions";
import { TranscriptPanel } from "@/features/podcasts/generator/components/TranscriptPanel";
import { episodeHref } from "@/features/podcasts/generator/constants";
import { useStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";
import { RunRecoveryBanner } from "@/features/podcasts/studio/components/RunRecoveryBanner";
import { RunTruthInspector } from "@/features/podcasts/studio/components/RunTruthInspector";
import { SourceSummaryPanel } from "@/features/podcasts/studio/components/SourceSummaryPanel";

export function StudioRunView({ runId }: { runId: string }) {
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
    livePlayer,
  } = useStudioRun(runId);

  // When the canonical audio URL lands while the user is listening live, carry
  // the position (and playing state) over to the real player and silence the
  // streaming one — never two audio sources at once.
  const [handoff, setHandoff] = useState<{
    timeSec: number;
    resume: boolean;
  } | null>(null);
  useEffect(() => {
    if (state.audioUrl && livePlayer) {
      const resume = livePlayer.isPlaying();
      const timeSec = livePlayer.getPositionMs() / 1000;
      livePlayer.pause();
      if (timeSec > 0) setHandoff({ timeSec, resume });
    }
  }, [state.audioUrl, livePlayer]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-2xl" />
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
  const rtl = state.podcastType === "persian";

  const firstDoneImage =
    state.images.find((s) => s.status === "done" && s.url)?.url ?? null;
  const effectiveCover = selectedCoverUrl ?? firstDoneImage;
  const hasVideo = state.videos.some((s) => s.status === "done" && s.url);
  const hasStages = state.stages.length > 0;
  const publicLink = episodeHref(state.episodeSlug, state.episodeId);

  // The merged "official" video — every clip + still stitched into one
  // crossfaded MP4 (square stills get blurred-fill sides). It's the episode's
  // primary, share-ready video and the default cover. Surfaced prominently so
  // the user can see/play it; absence on a finished multi-asset run is called
  // out (loud) rather than left silently missing.
  const mergedVideoUrl = state.officialVideoUrl;
  const doneMediaCount =
    state.images.filter((s) => s.status === "done" && s.url).length +
    state.videos.filter((s) => s.status === "done" && s.url).length;
  const mergedVideoMissing = isDone && !mergedVideoUrl && doneMediaCount >= 2;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Link
            href="/podcast/studio"
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Studio
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
              <Podcast className="h-5 w-5" />
            </span>
            {isRunning && !streaming ? "Studio run" : "Episode"}
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
            <Link href="/podcast/studio/create">
              <Plus className="h-4 w-4" />
              New episode
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — the episode: title, description, audio, then the visual options. */}
        <div className="order-1 min-w-0 space-y-6">
          <MetadataHero state={state} />

          {/* The merged episode video — the primary, share-ready video stitched
              from every clip + still. Shown first so it reads as the hero/default
              cover. */}
          {mergedVideoUrl && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Clapperboard className="h-4 w-4 text-primary" />
                  Episode video
                </h3>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Default cover — stitched from every image &amp; clip
                </span>
              </div>
              <div className="relative aspect-video w-full bg-black">
                <InlineMediaRef
                  ref={podcastMediaRef(mergedVideoUrl)}
                  as="video"
                  size="fill"
                  fit="contain"
                  rounded="none"
                  controls
                  playsInline
                  preload="metadata"
                  className="absolute inset-0"
                  alt="Episode video"
                />
              </div>
            </div>
          )}

          {mergedVideoMissing && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                The combined episode video couldn&apos;t be assembled from this
                run&apos;s media. Your individual clips and images are still
                available below; you can pick any image as the cover.
              </span>
            </div>
          )}

          {/* Audio: the finished player; the live (streaming) player while the
              TTS is still rendering; or the teaser before any audio exists. */}
          {state.audioUrl ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <PodcastAudioPlayer
                audioUrl={state.audioUrl}
                title={state.title}
                coverImageUrl={effectiveCover ?? undefined}
                initialTime={handoff?.timeSec}
                autoPlay={handoff?.resume ?? false}
              />
            </div>
          ) : livePlayer ? (
            <LiveAudioPlayer player={livePlayer} title={state.title} />
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

          {isDone && state.episodeId && (
            <EpisodeContentStudio episodeId={state.episodeId} />
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
            <ComingSoonCard
              icon={Bookmark}
              title="Chapter markers"
              description="Auto-generated timestamps that let listeners jump to each topic."
            />
          )}
        </div>

        {/* RIGHT — status & steps on top, then the script, source, and resources. */}
        <div className="order-2 space-y-4">
          {hasStages && <LiveProgressRail state={state} startedAt={startedAt} />}

          <RunRecoveryBanner
            status={state.status}
            streaming={streaming}
            stalled={stalled}
            backgroundWorking={backgroundWorking}
            canReconnect={canReconnect}
            canRerun={recovery.canRerun}
            audioMissing={!state.audioUrl}
            error={state.error}
            onResume={reconnect}
            onRerun={rerunFromSource}
          />

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
                    <span className="font-medium text-foreground/70">Episode ID:</span>{" "}
                    {state.episodeId}
                  </p>
                )}
                {publicLink && (
                  <p>
                    <span className="font-medium text-foreground/70">Public link:</span>{" "}
                    <Link href={publicLink} className="text-primary hover:underline">
                      {publicLink}
                    </Link>
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Full run truth — advanced inspector over the durable record (request,
          every agent stage's output/error/cost, the studio + episode rows).
          Always available so nothing about a run is ever hidden. */}
      <div className="mt-6">
        <RunTruthInspector
          agentRunId={detail?.run_id ?? null}
          studioRunId={runId}
          episodeId={state.episodeId}
        />
      </div>
    </div>
  );
}
