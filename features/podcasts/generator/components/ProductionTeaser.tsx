"use client";

// features/podcasts/generator/components/ProductionTeaser.tsx
//
// Fills the (long) wait while the audio renders, so the user is never just
// staring at a static screen. Audio is the long pole — cover art and videos
// usually finish minutes earlier, leaving dead time. This panel lives where the
// audio player will appear and keeps things alive with REAL generated content:
//   • a rotating showcase of the cover-art that's already rendered
//   • a genuine sneak-peek of the script (the create_script stage output, or
//     streamed chunk text if the pipeline provides it)
//   • an honest "producing your audio" status with elapsed time.
// It deliberately does NOT render fake playback controls — nothing here pretends
// to be the finished player.

import { useEffect, useState } from "react";
import { AudioLines } from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import { cn } from "@/lib/utils";
import { ElapsedTimer } from "./ElapsedTimer";
import { parseScript, speakerSlot } from "../script";
import type { PodcastRunState } from "../types";

interface ProductionTeaserProps {
  state: PodcastRunState;
  startedAt: number | null;
}

const ROTATE_MS = 3500;

export function ProductionTeaser({ state, startedAt }: ProductionTeaserProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const readyImages = state.images.filter((s) => s.status === "done" && s.url);
  const rtl = state.podcastType === "persian";

  // Tease the actual two-host conversation by speaker. Prefer streamed text
  // (its tail is the freshest dialogue); fall back to the create_script preview.
  const live = parseScript(state.liveText);
  const fromPreview = parseScript(state.scriptPreview);
  const streaming = live.turns.length > 0;
  const dialogue = streaming ? live : fromPreview;
  const turns = dialogue.turns;
  // While streaming, ride the live tail; otherwise gently rotate the snippet.
  const windowStart =
    turns.length <= 2
      ? 0
      : streaming
        ? turns.length - 2
        : tick % (turns.length - 1);
  const teaseTurns = turns.slice(windowStart, windowStart + 2);

  // Rotating concept line when there's no dialogue text yet.
  const prompts = [
    ...state.images.map((s) => s.prompt),
    ...state.videos.map((s) => s.prompt),
  ].filter(Boolean);
  const concept = state.description || (prompts.length ? prompts[tick % prompts.length] : "");

  const activeImage = readyImages.length
    ? readyImages[tick % readyImages.length]
    : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid gap-0 sm:grid-cols-[minmax(0,260px)_1fr]">
        {/* Rotating cover showcase */}
        <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-muted via-accent/30 to-muted sm:aspect-auto">
          {readyImages.map((slot) => {
            const isActive = slot.url === activeImage?.url;
            return (
              <div
                key={slot.index}
                className={cn(
                  "absolute inset-0 transition-opacity duration-1000",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              >
                <InlineMediaRef
                  ref={slot.url ?? null}
                  size="fill"
                  fit="cover"
                  alt="Cover concept"
                  fallback="skeleton"
                />
              </div>
            );
          })}
          {readyImages.length === 0 && (
            <div className="absolute inset-0 flex animate-pulse items-center justify-center">
              <AudioLines className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}
          {readyImages.length > 1 && (
            <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1">
              {readyImages.map((slot) => (
                <span
                  key={slot.index}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    slot.url === activeImage?.url
                      ? "w-4 bg-white"
                      : "w-1.5 bg-white/50",
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sneak peek + status */}
        <div className="flex min-w-0 flex-col p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              In the studio
            </span>
          </div>

          {/* Reserve two lines so a 1- vs 2-line title never shifts layout. */}
          <p className="mb-3 line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-tight text-foreground">
            {state.title || "Producing your episode…"}
          </p>

          {/* FIXED height — streaming/rotating text changes content inside this
              box but never its size, so the card (and the page) never shift. */}
          <div
            className="relative h-28 overflow-hidden"
            dir={rtl ? "rtl" : undefined}
          >
            {teaseTurns.length > 0 ? (
              <>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  Sneak peek of the conversation
                </p>
                <div className="space-y-2">
                  {teaseTurns.map((turn, i) => (
                    <p key={windowStart + i} className="text-sm leading-relaxed">
                      <span
                        className={cn(
                          "font-semibold",
                          speakerSlot(turn.speaker, dialogue.speakers) === 0
                            ? "text-primary"
                            : "text-secondary",
                        )}
                      >
                        {turn.speaker}:
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {turn.text.slice(0, 180)}
                        {turn.text.length > 180 ? "…" : ""}
                      </span>
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                  {state.description ? "About this episode" : "Now imagining"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {concept || "Setting the scene…"}
                </p>
              </>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
          </div>

          {/* Honest status — producing audio, with a live equalizer */}
          <div className="mt-4 flex items-center gap-2.5 border-t border-border pt-3 text-sm">
            <span className="flex h-6 items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-primary/70 animate-[pulse_1s_ease-in-out_infinite]"
                  style={{
                    height: `${40 + ((i * 37) % 60)}%`,
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </span>
            <span className="font-medium text-foreground">
              Producing your audio
            </span>
            <span className="ml-auto tabular-nums text-xs text-muted-foreground">
              <ElapsedTimer startedAt={startedAt} running />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
