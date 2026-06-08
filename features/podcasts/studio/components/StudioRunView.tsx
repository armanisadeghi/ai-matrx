"use client";

// features/podcasts/studio/components/StudioRunView.tsx
//
// The persistent run page (/podcast/studio/run/[id]). Streams live when reached
// from the create form, and rebuilds the full studio view from the saved row on
// any later return — hero, audio, every cover/video option, transcript, and the
// post-creation toolkit. A creation is never lost again.

import Link from "next/link";
import {
  Podcast,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Loader2,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { MetadataHero } from "@/features/podcasts/generator/components/MetadataHero";
import { LiveProgressRail } from "@/features/podcasts/generator/components/LiveProgressRail";
import { ProductionTeaser } from "@/features/podcasts/generator/components/ProductionTeaser";
import { MediaOptionsGrid } from "@/features/podcasts/generator/components/MediaOptionsGrid";
import { ResultActions } from "@/features/podcasts/generator/components/ResultActions";
import { TranscriptPanel } from "@/features/podcasts/generator/components/TranscriptPanel";
import { episodeHref } from "@/features/podcasts/generator/constants";
import { useStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";

export function StudioRunView({ runId }: { runId: string }) {
  const {
    state,
    startedAt,
    loading,
    notFound,
    streaming,
    canReconnect,
    reconnect,
    selectedCoverUrl,
    selectCover,
  } = useStudioRun(runId);

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
  const isError = state.status === "error";
  const isRunning = state.status === "running";
  const rtl = state.podcastType === "persian";

  const firstDoneImage =
    state.images.find((s) => s.status === "done" && s.url)?.url ?? null;
  const effectiveCover = selectedCoverUrl ?? firstDoneImage;
  const hasVideo = state.videos.some((s) => s.status === "done" && s.url);
  const showRail = streaming || state.stages.length > 0;

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
        <Button asChild variant="outline" className="gap-2">
          <Link href="/podcast/studio/create">
            <Plus className="h-4 w-4" />
            New episode
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Main column */}
        <div className="order-2 space-y-6 lg:order-1">
          {isDone && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span className="font-medium">
                Your episode is ready — listen, pick a cover, then open or publish
                it.
              </span>
            </div>
          )}
          {isError && (
            <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Generation hit an error</p>
                  {state.error && (
                    <p className="mt-0.5 text-destructive/80">{state.error}</p>
                  )}
                  {canReconnect && (
                    <p className="mt-0.5 text-destructive/70">
                      Resume picks up from the failed step — finished work isn&apos;t
                      redone.
                    </p>
                  )}
                </div>
              </div>
              {canReconnect && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reconnect}
                  className="shrink-0 gap-1.5 border-destructive/40"
                >
                  <RefreshCw className="h-4 w-4" />
                  Resume
                </Button>
              )}
            </div>
          )}
          {isRunning && !streaming && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-500 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  This run was interrupted. Everything generated so far is saved;
                  {canReconnect
                    ? " reconnect to pick up where it left off."
                    : " if it finished on the server, your episode will appear shortly."}
                </span>
              </span>
              {canReconnect && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reconnect}
                  className="shrink-0 gap-1.5 border-amber-500/40"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reconnect
                </Button>
              )}
            </div>
          )}

          <MetadataHero state={state} />

          {/* Audio player on completion — or the live production teaser */}
          {state.audioUrl ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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

          <MediaOptionsGrid
            state={state}
            interactive={isDone && !!state.episodeId}
            selectedCoverUrl={effectiveCover}
            onSelectCover={selectCover}
          />

          <TranscriptPanel script={state.script} rtl={rtl} />

          {isDone && (
            <div className="space-y-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              {state.episodeId && (
                <p className="break-all">
                  <span className="font-medium text-foreground/70">
                    Episode ID:
                  </span>{" "}
                  {state.episodeId}
                </p>
              )}
              {episodeHref(state.episodeSlug, state.episodeId) && (
                <p>
                  <span className="font-medium text-foreground/70">
                    Public link:
                  </span>{" "}
                  <Link
                    href={episodeHref(state.episodeSlug, state.episodeId)!}
                    className="text-primary hover:underline"
                  >
                    {episodeHref(state.episodeSlug, state.episodeId)}
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — live rail only while streaming */}
        {showRail && (
          <div className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-4">
              <LiveProgressRail state={state} startedAt={startedAt} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
