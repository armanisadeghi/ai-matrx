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
  Clapperboard,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { podcastMediaRef } from "@/features/podcasts/generator/media";
import { videoBlockFromMediaRef } from "@/features/files/blocks/adapters/from-media-ref";
import { UnifiedVideoBlockRenderer } from "@/features/files/blocks/video/UnifiedVideoBlockRenderer";
import { EpisodeContentStudio } from "@/features/podcasts/studio/components/EpisodeContentStudio";
import { EpisodeChaptersPanel } from "@/features/podcasts/studio/components/EpisodeChaptersPanel";
import { EpisodeTitlePanel } from "@/features/podcasts/studio/components/EpisodeTitlePanel";
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
import { RunRecoveryBannerFor } from "@/features/podcasts/studio/components/RunRecoveryBanner";
import { RunTruthInspector } from "@/features/podcasts/studio/components/RunTruthInspector";
import { SourceSummaryPanel } from "@/features/podcasts/studio/components/SourceSummaryPanel";
import { ResearchActivityFeed } from "@/features/podcasts/studio/components/ResearchActivityFeed";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { PodcastRunWriteTargets } from "@/features/podcasts/studio/components/PodcastRunWriteTargets";
import {
  createPodcastRunScope,
  type PodcastRunSlotEntry,
} from "@/features/surfaces/manifests/podcast-run.manifest";
import type { RunAsset } from "@/features/podcasts/studio/runs/run-types";
import type { PcEpisodeChapter } from "@/features/podcasts/types";

/** Durable refs only — the run's asset URLs are signed and expire, so the
 *  surface emits `file_id` and status, never a link. */
function slotEntries(
  assets: RunAsset[] | undefined,
  kind: "image" | "video",
): PodcastRunSlotEntry[] {
  return (assets ?? [])
    .filter((a) => a.asset_kind === kind)
    .map((a) => ({
      index: a.slot,
      status: a.status,
      prompt: a.prompt,
      model_alias: a.model_alias,
      file_id: a.file_id,
    }));
}

export function StudioRunView({ runId }: { runId: string }) {
  // Keep the hook result so RunRecoveryBannerFor derives its own props —
  // five hand-wired copies is what let `audioMissing` go missing elsewhere.
  const run = useStudioRun(runId);
  const {
    state,
    startedAt,
    loading,
    notFound,
    streaming,
    stalled,
    backgroundWorking,
    canReconnect,
    refresh,
    detail,
    recovery,
    assetBusy,
    regenerateAsset,
    addAsset,
    selectedCoverUrl,
    selectCover,
    reflectEpisodeMetadata,
    livePlayer,
    researchActivity,
  } = run;

  // The episode's persisted chapter markers, lifted out of EpisodeChaptersPanel
  // (which owns the fetch and the canonical save) so the surface can emit them
  // as the READ TWIN of the `episode_chapters` write target — an agent has to
  // see the existing start_hint timestamps to preserve them.
  const [episodeChapters, setEpisodeChapters] = useState<
    PcEpisodeChapter[] | null
  >(null);

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
      if (timeSec <= 0) return undefined;
      const handoffTimer = setTimeout(() => setHandoff({ timeSec, resume }), 0);
      return () => clearTimeout(handoffTimer);
    }
    return undefined;
  }, [state.audioUrl, livePlayer]);

  if (loading) {
    return (
      <>
        <PageHeader>
          <span className="ml-2 text-sm font-medium text-foreground truncate">
            Studio run
          </span>
        </PageHeader>
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
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <EntityModeHeader
          backHref="/podcast/studio"
          entityLabel="Run not found"
        />
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Podcast className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-semibold text-foreground">
            Run not found
          </h1>
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
      </>
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
  const hasMetadata = state.title.trim().length > 0;
  const publicLink = episodeHref(state.episodeSlug, state.episodeId);

  // The merged "official" video — every clip + still stitched into one
  // crossfaded MP4 (square stills get blurred-fill sides). It's the episode's
  // primary, share-ready video and the default cover. Surfaced prominently so
  // the user can see/play it; absence on a finished multi-asset run is called
  // out (loud) rather than left silently missing.
  const mergedVideoUrl = state.officialVideoUrl;
  const mergedVideoBlock = videoBlockFromMediaRef(
    podcastMediaRef(mergedVideoUrl),
  );
  const doneMediaCount =
    state.images.filter((s) => s.status === "done" && s.url).length +
    state.videos.filter((s) => s.status === "done" && s.url).length;
  const mergedVideoMissing = isDone && !mergedVideoUrl && doneMediaCount >= 2;

  // ── Surface emitter (matrx-user/podcast-run) ──────────────────────────
  // Built at Run time from live state + the durable run detail. Per-slot
  // file_ids only exist once the detail has loaded; before that the live
  // slots are emitted with a null file_id rather than an expiring URL.
  const getSurfaceScope = () =>
    createPodcastRunScope({
      studio_run_id: runId,
      run_status: state.status,
      progress_percent: state.progress,
      total_steps: state.totalSteps,
      streaming,
      stalled,
      background_working: backgroundWorking,
      audio_available: !!state.audioUrl,
      official_video_available: !!state.officialVideoUrl,
      backend_run_id: detail?.run_id ?? undefined,
      liveness: detail?.liveness,
      podcast_type: state.podcastType ?? undefined,
      run_source: detail?.source
        ? {
            input_data_type: detail.source.input_data_type,
            summary: detail.source.summary,
            file_urls: detail.source.file_urls,
          }
        : undefined,
      started_at: startedAt ? new Date(startedAt).toISOString() : undefined,
      stages: state.stages.map((s) => ({
        stage: s.stage,
        label: s.label,
        status: s.status,
        step: s.step,
        total: s.total,
      })),
      current_stage_label: state.currentLabel || undefined,
      episode_title: state.title || undefined,
      episode_description: state.description || undefined,
      script: state.script || undefined,
      script_preview: state.scriptPreview || undefined,
      source_preview: state.sourcePreview || undefined,
      episode_chapters: episodeChapters
        ? episodeChapters.map((c) => ({
            start_hint: c.start_hint,
            title: c.title,
            summary: c.summary,
          }))
        : undefined,
      episode_id: state.episodeId ?? undefined,
      episode_slug: state.episodeSlug ?? undefined,
      show_id: state.showId ?? undefined,
      audio_file_id: state.audioFileId ?? detail?.audio_file_id ?? undefined,
      cover_file_id: detail?.cover_file_id ?? undefined,
      image_slots: detail?.assets
        ? slotEntries(detail.assets, "image")
        : state.images.map((s) => ({
            index: s.index,
            status: s.status,
            prompt: s.prompt,
            model_alias: null,
            file_id: null,
          })),
      video_slots: detail?.assets
        ? slotEntries(detail.assets, "video")
        : state.videos.map((s) => ({
            index: s.index,
            status: s.status,
            prompt: s.prompt,
            model_alias: null,
            file_id: null,
          })),
      run_error: state.error ?? undefined,
      recovery: detail
        ? {
            resumable: detail.recovery.resumable,
            can_rerun_from_source: detail.recovery.can_rerun_from_source,
            can_reconnect: canReconnect,
          }
        : undefined,
      stage_progress: detail
        ? {
            done: detail.stage_progress.done,
            failed: detail.stage_progress.failed,
            total: detail.stage_progress.total,
          }
        : undefined,
      run_request: detail?.request,
      research_activity: researchActivity.map((e) => ({
        tool: e.toolName,
        event: e.event,
        message: e.message,
        at: e.at,
      })),
      selection: window.getSelection()?.toString() || undefined,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/podcast-run"
      getScope={getSurfaceScope}
      isEditable={false}
    >
      {/* The write half of matrx-user/podcast-run: episode_title +
          episode_description. episode_chapters registers itself from
          EpisodeChaptersPanel, which owns that list and its canonical save. */}
      <PodcastRunWriteTargets run={run} />
      <EntityModeHeader
        backHref="/podcast/studio"
        entityLabel={isRunning && !streaming ? "Studio run" : "Episode"}
        actions={[
          { label: "Refresh", icon: RefreshCw, onPress: refresh },
          {
            label: "New episode",
            icon: Plus,
            href: "/podcast/studio/create",
            primary: true,
          },
        ]}
      />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <div
          className={cn(
            "grid gap-6 lg:grid-cols-[1fr_360px]",
            // Before metadata lands, reserve at least one complete viewport for
            // the episode canvas. The advanced inspector can never rise into the
            // initial composition while the right rail grows event by event.
            !hasMetadata && "min-h-dvh",
          )}
        >
          {/* LEFT — the episode: title, description, audio, then the visual options. */}
          <div className="order-1 min-w-0 space-y-6">
            <MetadataHero state={state} />

            {/* The merged episode video — the primary, share-ready video stitched
              from every clip + still. Shown first so it reads as the hero/default
              cover. */}
            {mergedVideoBlock && (
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
                  <div className="absolute inset-0 [&_.group]:m-0 [&_.group]:h-full [&_.group]:w-full [&_.group>video]:h-full [&_.group>video]:max-h-none [&_.group>video]:w-full [&_.group>video]:min-h-0 [&_.group>video]:min-w-0 [&_.group>video]:rounded-none [&_.group>video]:object-contain">
                    <UnifiedVideoBlockRenderer block={mergedVideoBlock} />
                  </div>
                </div>
              </div>
            )}

            {mergedVideoMissing && (
              <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  The combined episode video couldn&apos;t be assembled from
                  this run&apos;s media. Your individual clips and images are
                  still available below; you can pick any image as the cover.
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

            {isDone && state.episodeId && (
              <EpisodeTitlePanel
                episodeId={state.episodeId}
                onTitleApplied={(title) => reflectEpisodeMetadata({ title })}
              />
            )}

            {isDone && state.episodeId && (
              <EpisodeChaptersPanel
                episodeId={state.episodeId}
                onChaptersChange={setEpisodeChapters}
              />
            )}
          </div>

          {/* RIGHT — status & steps on top, then the script, source, and resources. */}
          <div className="order-2 space-y-4">
            {hasStages && (
              <LiveProgressRail state={state} startedAt={startedAt} />
            )}

            {/* Real backend tool activity, layered on top of the rail's synthetic
              steps — self-hides when the stream sends none. */}
            <ResearchActivityFeed
              entries={researchActivity}
              streaming={streaming}
            />

            <RunRecoveryBannerFor run={run} />

            {state.script && (
              <TranscriptPanel script={state.script} rtl={rtl} />
            )}

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
    </SurfaceRuntimeProvider>
  );
}
