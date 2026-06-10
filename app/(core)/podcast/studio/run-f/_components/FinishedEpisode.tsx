"use client";

// app/(core)/podcast/studio/run-f/_components/FinishedEpisode.tsx
//
// The finale: when the run completes, the booth resolves into a finished
// episode hero — cover art, title, description, a real <audio> player, the
// produced assets, and the script. Modeled on a streaming-app "now playing"
// header. The audio_url in the mock is a genuine short sample so the player
// actually plays.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Pause, ExternalLink, RotateCcw, FileText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { BoothState } from "./boothState";
import { AssetGallery } from "./AssetGallery";

export function FinishedEpisode({
  state,
  onRunAgain,
}: {
  state: BoothState;
  onRunAgain: () => void;
}) {
  const cover = state.images[0]?.url ?? null;
  const href = state.episodeSlug ? `/podcast/${state.episodeSlug}` : "/podcast/studio";

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl border border-glass-edge bg-glass backdrop-blur-glass backdrop-saturate-glass shadow-glass-lg">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl border border-border bg-muted sm:w-44">
            {cover ? (
              <Image src={cover} alt={state.title} fill sizes="176px" className="object-cover" unoptimized />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/20 to-secondary/20" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Episode ready
            </span>
            <h1 className="mt-2 text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {state.title || "Your episode"}
            </h1>
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
              {state.description}
            </p>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <Button asChild className="gap-1.5">
                <Link href={href}>
                  <ExternalLink className="h-4 w-4" />
                  Open episode
                </Link>
              </Button>
              <Button variant="outline" onClick={onRunAgain} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Run again
              </Button>
            </div>
          </div>
        </div>

        {/* Player bar */}
        {state.audioUrl && <PlayerBar src={state.audioUrl} />}
      </div>

      <AssetGallery state={state} />

      {/* Script */}
      {state.script && <ScriptPanel script={state.script} />}
    </div>
  );
}

function PlayerBar({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Own the Audio element imperatively (an external system) — created once,
  // its "ended" listener wired up and torn down with the component.
  useEffect(() => {
    const audio = new Audio(src);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("ended", onEnded);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => undefined);
      setPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-3 border-t border-glass-edge bg-card/40 px-5 py-3.5">
      <button
        type="button"
        onClick={toggle}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
      </button>
      <div className="flex flex-1 items-center gap-[3px]">
        {Array.from({ length: 48 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full bg-primary/50",
              playing && "animate-pulse",
            )}
            style={{
              height: `${10 + ((i * 29) % 24)}px`,
              animationDelay: `${(i % 9) * 70}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ScriptPanel({ script }: { script: string }) {
  return (
    <Collapsible defaultOpen>
      <div className="rounded-2xl border border-border bg-card">
        <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Transcript
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2.5 px-4 pb-4">
            {script.split("\n").filter(Boolean).map((line, i) => {
              const [speaker, ...rest] = line.split(":");
              const body = rest.join(":").trim();
              const hasSpeaker = body.length > 0;
              return (
                <p key={i} className="text-sm leading-relaxed">
                  {hasSpeaker && (
                    <span className="mr-1.5 font-semibold text-primary">{speaker}:</span>
                  )}
                  <span className="text-foreground/85">{hasSpeaker ? body : line}</span>
                </p>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
