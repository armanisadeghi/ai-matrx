"use client";

// features/podcasts/generator/components/PodcastGenerator.tsx
//
// The studio's create surface. Orchestrates the compose form, the live
// streaming console, and the post-generation toolkit around a single
// usePodcastRun state machine. From the moment Generate is hit, the UI is
// never idle — stages stream, the title lands early, cover/video options fill
// in one-by-one, then the audio player + episode link appear.

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Podcast,
  Mic,
  RotateCcw,
  X,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiAuth } from "@/hooks/useApiAuth";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { podcastService } from "@/features/podcasts/service";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import { usePodcastRun } from "../usePodcastRun";
import { GeneratorForm } from "./GeneratorForm";
import { LiveProgressRail } from "./LiveProgressRail";
import { MetadataHero } from "./MetadataHero";
import { MediaOptionsGrid } from "./MediaOptionsGrid";
import { ResultActions } from "./ResultActions";
import { TranscriptPanel } from "./TranscriptPanel";
import { episodeHref } from "../constants";

export function PodcastGenerator() {
  const { isAuthenticated } = useApiAuth();
  const { shows, registerShow, refresh } = useMyPodcasts();
  const run = usePodcastRun();
  const { state, startedAt } = run;

  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);

  const isIdle = state.status === "idle";
  const isRunning = state.status === "running";
  const isDone = state.status === "done";
  const isError = state.status === "error";
  const rtl = state.podcastType === "persian";

  const firstDoneImage =
    state.images.find((s) => s.status === "done" && s.url)?.url ?? null;
  const effectiveCover = selectedCoverUrl ?? firstDoneImage;
  const hasVideo = state.videos.some((s) => s.status === "done" && s.url);

  const handleSelectCover = async (url: string) => {
    setSelectedCoverUrl(url);
    if (!state.episodeId) return;
    try {
      await podcastService.updateEpisode(state.episodeId, { image_url: url });
      toast.success("Cover updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't set cover");
    }
  };

  const handleGenerate = (body: Parameters<typeof run.start>[0]) => {
    setSelectedCoverUrl(null);
    void run.start(body);
  };

  const handleReset = () => {
    run.reset();
    setSelectedCoverUrl(null);
    void refresh();
  };

  // ── Auth gate ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Mic className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          Sign in to create podcasts
        </h1>
        <p className="text-sm text-muted-foreground">
          The podcast studio turns any idea, document, or note into a fully
          produced two-host episode — with cover art, video, and audio.
        </p>
        <Button asChild className="gap-2">
          <Link href="/login?next=/podcast/studio/create">
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      {/* Page header */}
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
            Create an episode
          </h1>
        </div>
        {!isIdle && (
          <Button
            variant={isRunning ? "outline" : "default"}
            onClick={handleReset}
            className="gap-2"
          >
            {isRunning ? (
              <>
                <X className="h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                New episode
              </>
            )}
          </Button>
        )}
      </div>

      {/* ── Compose ──────────────────────────────────────────────────────── */}
      {isIdle ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <GeneratorForm
            shows={shows}
            onShowCreated={registerShow}
            onGenerate={handleGenerate}
            busy={false}
          />
        </div>
      ) : (
        /* ── Live console ──────────────────────────────────────────────── */
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="order-2 space-y-6 lg:order-1">
            {/* Completion / error banner */}
            {isDone && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span className="font-medium">
                  Your episode is ready — listen, pick a cover, then open or
                  publish it.
                </span>
              </div>
            )}
            {isError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Generation hit an error</p>
                  {state.error && (
                    <p className="mt-0.5 text-destructive/80">{state.error}</p>
                  )}
                </div>
              </div>
            )}

            <MetadataHero state={state} />

            {/* Audio player (on complete) */}
            {state.audioUrl && (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <PodcastAudioPlayer
                  audioUrl={state.audioUrl}
                  title={state.title}
                  coverImageUrl={effectiveCover ?? undefined}
                />
              </div>
            )}

            {/* Post-creation toolkit */}
            {isDone && state.episodeId && (
              <ResultActions
                episodeId={state.episodeId}
                episodeSlug={state.episodeSlug}
                audioUrl={state.audioUrl}
                title={state.title}
                hasVideo={hasVideo}
              />
            )}

            {/* Media options */}
            <MediaOptionsGrid
              state={state}
              interactive={isDone && !!state.episodeId}
              selectedCoverUrl={effectiveCover}
              onSelectCover={handleSelectCover}
            />

            {/* Transcript */}
            <TranscriptPanel script={state.script} rtl={rtl} />

            {/* Verification footer */}
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
                {state.audioUrl && (
                  <p className="break-all">
                    <span className="font-medium text-foreground/70">
                      Audio URL:
                    </span>{" "}
                    <a
                      href={state.audioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {state.audioUrl.slice(0, 80)}…
                    </a>
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

          {/* Sidebar — sticky live rail */}
          <div className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-4">
              <LiveProgressRail state={state} startedAt={startedAt} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
