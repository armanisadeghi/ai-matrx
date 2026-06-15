"use client";

// app/(core)/podcast/studio/run-e/_components/FinishedPlayer.tsx
//
// The finale — when the run completes, the console transforms into a "now
// playing" view (the Apple Music / Spotify track screen): big cover, title +
// show notes, a real <audio> player, the produced asset gallery, and the
// script. The act of finishing feels like an artifact arriving, not a form
// returning a result.

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  ExternalLink,
  ImageIcon,
  Clapperboard,
  FileText,
  ChevronDown,
  CircleCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { episodeHref } from "@/features/podcasts/generator/constants";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { Equalizer } from "./Equalizer";

export function FinishedPlayer({ state }: { state: PodcastRunState }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);

  const cover = state.images.find((i) => i.url)?.url ?? null;
  const videos = state.videos.filter((v) => v.url);
  const extraImages = state.images.filter((i) => i.url);
  const href = episodeHref(state.episodeSlug, state.episodeId);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      {/* Done banner */}
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CircleCheck className="h-3.5 w-3.5" />
        Episode ready
      </div>

      {/* Now-playing hero */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Cover */}
        <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl border border-border bg-muted shadow-sm sm:w-56">
          {cover ? (
            <img
              src={cover}
              alt={state.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          {playing && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <Equalizer bars={4} className="h-3 text-white" />
              Playing
            </span>
          )}
        </div>

        {/* Meta + transport */}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
            {state.title || "Your episode"}
          </h1>
          {state.description && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {state.description}
            </p>
          )}

          {/* Transport */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              disabled={!state.audioUrl}
              className={cn(
                "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 disabled:opacity-50",
              )}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="ml-0.5 h-5 w-5" />
              )}
            </button>
            <audio
              ref={audioRef}
              src={state.audioUrl ?? undefined}
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              controls
              className="h-10 min-w-0 flex-1"
            />
          </div>

          {href && (
            <Button asChild variant="outline" size="sm" className="mt-4 gap-2">
              <Link href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open the episode page
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Produced assets gallery */}
      {(extraImages.length > 0 || videos.length > 0) && (
        <section className="mt-7">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Produced assets
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {extraImages.map((img) => (
              <GalleryItem
                key={`img-${img.index}`}
                url={img.url!}
                prompt={img.prompt}
                icon={ImageIcon}
                label="Cover art"
              />
            ))}
            {videos.map((v) => (
              <GalleryItem
                key={`vid-${v.index}`}
                url={v.url!}
                prompt={v.prompt}
                icon={Clapperboard}
                label="Video clip"
              />
            ))}
          </div>
        </section>
      )}

      {/* Script — self-managed disclosure (no hydration-gated wrapper). */}
      {state.script && (
        <div className="mt-7">
          <button
            type="button"
            onClick={() => setScriptOpen((o) => !o)}
            aria-expanded={scriptOpen}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Full script
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                scriptOpen && "rotate-180",
              )}
            />
          </button>
          {scriptOpen && (
            <div className="mt-2 rounded-xl border border-border bg-card p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                {state.script}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GalleryItem({
  url,
  prompt,
  icon: Icon,
  label,
}: {
  url: string;
  prompt: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <figure
      className="group relative aspect-video overflow-hidden rounded-xl border border-border bg-muted"
      title={prompt}
    >
      <img src={url} alt={prompt} className="h-full w-full object-cover" />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-2 text-[11px] font-medium text-white">
        <Icon className="h-3 w-3" />
        {label}
      </figcaption>
    </figure>
  );
}
