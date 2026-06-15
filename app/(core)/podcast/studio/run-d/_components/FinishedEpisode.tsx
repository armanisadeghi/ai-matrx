"use client";

// app/(core)/podcast/studio/run-d/_components/FinishedEpisode.tsx
//
// The payoff: the finished episode as a polished release card with a real audio
// player, the produced gallery, and the full script. Reference: a Spotify /
// Apple Podcasts episode page. This is what the pipeline resolves into when the
// run completes.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  Download,
  Share2,
  ExternalLink,
  ImageIcon,
  Clapperboard,
  FileText,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { episodeHref } from "@/features/podcasts/generator/constants";

export function FinishedEpisode({ state }: { state: PodcastRunState }) {
  const cover = state.images.find((i) => i.status === "done" && i.url)?.url;
  const href = episodeHref(state.episodeSlug, state.episodeId);
  const gallery = [...state.images, ...state.videos].filter(
    (s) => s.status === "done" && s.url,
  );

  return (
    <div className="space-y-5">
      {/* Release header */}
      <div className="overflow-hidden rounded-2xl border border-glass-edge bg-glass shadow-glass backdrop-blur-glass backdrop-saturate-glass">
        <div className="flex flex-col gap-5 p-5 sm:flex-row">
          <div className="mx-auto w-40 shrink-0 sm:mx-0">
            {cover ? (
              <img
                src={cover}
                alt={state.title}
                className="aspect-square w-full rounded-xl object-cover shadow-md"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-muted">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Episode ready
            </span>
            <h1 className="mt-2.5 text-xl font-bold leading-tight text-foreground">
              {state.title}
            </h1>
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {state.description}
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              {href && (
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open episode
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5">
                <Share2 className="h-4 w-4" />
                Share
              </Button>
              {state.audioUrl && (
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href={state.audioUrl} download>
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Audio player */}
        {state.audioUrl && <AudioPlayer src={state.audioUrl} />}
      </div>

      {/* Gallery */}
      {gallery.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            Produced assets
            <span className="font-normal normal-case opacity-70">
              {gallery.length} items
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((s) => (
              <div
                key={`${s.kind}-${s.index}`}
                className="group relative aspect-video overflow-hidden rounded-xl border border-border bg-muted"
              >
                <img
                  src={s.url!}
                  alt={s.prompt}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-sm">
                  {s.kind === "video" ? (
                    <Clapperboard className="h-3 w-3" />
                  ) : (
                    <ImageIcon className="h-3 w-3" />
                  )}
                  {s.kind === "video" ? "Video" : "Art"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full script */}
      {state.script && (
        <Collapsible defaultOpen>
          <div className="rounded-2xl border border-border bg-card">
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Full transcript
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="max-h-80 overflow-y-auto border-t border-border px-4 py-3 scrollbar-thin">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
                  {state.script}
                </pre>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
}

function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => {
      setCurrent(a.currentTime);
      setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
    };
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = ratio * a.duration;
  };

  return (
    <div className="flex items-center gap-3 border-t border-border/60 bg-background/40 px-5 py-3.5">
      <audio ref={ref} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="ml-0.5 h-5 w-5 fill-current" />
        )}
      </button>
      <div className="flex-1">
        <div
          onClick={seek}
          className="group relative h-2 cursor-pointer rounded-full bg-muted"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />
          <div
            className={cn(
              "absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover:opacity-100",
            )}
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
