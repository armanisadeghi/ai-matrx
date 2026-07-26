"use client";

// app/(core)/podcast/studio/run-reimagine/[id]/_components/StageCanvas.tsx
//
// The heart of the reimagined run surface: a single LIVING canvas that morphs
// from "the studio at work" into "the finished album". Reference model: a
// Spotify Now-Playing canvas fused with a broadcast control-room program monitor.
//
// One frame, three lives — all REAL, no fakes:
//   • Producing — the actual cover-art that's already rendered rotates inside the
//     frame (or a breathing studio placeholder before the first image lands),
//     with a live "in the studio" status, the real script sneak-peek, and an
//     elapsed equalizer. This PRESERVES every behavior of the original
//     ProductionTeaser (rotating real covers, real dialogue tease, honest audio
//     status) — it just lives on the hero canvas instead of beside it.
//   • Stalled / failed — the frame dims and the canvas hands off to the recovery
//     banner rendered by the parent (never a dead end).
//   • Done — the same frame becomes the album cover with the full audio player
//     faded up beneath it. The audio resolves INTO the canvas the user watched
//     fill in, so there's no jarring layout swap.

import { useEffect, useState } from "react";
import { AudioLines, CheckCircle2 } from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import { cn } from "@/lib/utils";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { ElapsedTimer } from "@/features/podcasts/generator/components/ElapsedTimer";
import { parseScript, speakerSlot } from "@/features/podcasts/generator/script";
import { podcastMediaRef } from "@/features/podcasts/generator/media";
import type { PodcastRunState } from "@/features/podcasts/generator/types";

const ROTATE_MS = 3500;

interface StageCanvasProps {
  state: PodcastRunState;
  startedAt: number | null;
  streaming: boolean;
  /** The chosen / first-ready cover URL (durable-recovered upstream). */
  coverUrl: string | null;
}

export function StageCanvas({
  state,
  startedAt,
  streaming,
  coverUrl,
}: StageCanvasProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const isDone = state.status === "done";
  const rtl = state.podcastType === "persian";
  const readyImages = state.images.filter((s) => s.status === "done" && s.url);
  const activeImage = readyImages.length
    ? readyImages[tick % readyImages.length]
    : null;

  // ── DONE: the frame becomes the album cover + the player fades up beneath. ──
  if (isDone && state.audioUrl) {
    return (
      <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
          {coverUrl ? (
            <InlineMediaRef
              ref={podcastMediaRef(coverUrl)}
              size="fill"
              fit="cover"
              alt={state.title || "Episode cover"}
              fallback="skeleton"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted via-accent/30 to-muted">
              <AudioLines className="h-12 w-12 text-muted-foreground/40" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur">
            <CheckCircle2 className="h-3 w-3" />
            Episode ready
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <PodcastAudioPlayer
            audioUrl={state.audioUrl}
            title={state.title}
            coverImageUrl={coverUrl ?? undefined}
          />
        </div>
      </div>
    );
  }

  // ── PRODUCING (or interrupted-with-saved-work): the living stage. ──────────
  // Sneak-peek of the conversation, preferring streamed text tail.
  const live = parseScript(state.liveText);
  const fromPreview = parseScript(state.scriptPreview || state.script);
  const isStreamingText = live.turns.length > 0;
  const dialogue = isStreamingText ? live : fromPreview;
  const turns = dialogue.turns;
  const windowStart =
    turns.length <= 2
      ? 0
      : isStreamingText
        ? turns.length - 2
        : tick % (turns.length - 1);
  const teaseTurns = turns.slice(windowStart, windowStart + 2);

  const prompts = [
    ...state.images.map((s) => s.prompt),
    ...state.videos.map((s) => s.prompt),
  ].filter(Boolean);
  const concept =
    state.description || (prompts.length ? prompts[tick % prompts.length] : "");

  return (
    <div className="space-y-4">
      {/* Living cover frame */}
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-muted via-accent/30 to-muted shadow-xl">
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
                ref={podcastMediaRef(slot.url)}
                size="fill"
                fit="cover"
                alt="Cover concept"
                fallback="skeleton"
              />
            </div>
          );
        })}

        {readyImages.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="flex h-16 items-end gap-1.5" aria-hidden>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="w-2 rounded-full bg-primary/40 motion-safe:animate-[pulse_1.4s_ease-in-out_infinite]"
                  style={{
                    height: `${30 + ((i * 41) % 60)}%`,
                    animationDelay: `${i * 0.13}s`,
                  }}
                />
              ))}
            </span>
            <p className="text-xs font-medium text-muted-foreground">
              Designing the cover art…
            </p>
          </div>
        )}

        {/* Live status overlay (only while actually streaming) */}
        {streaming && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 to-transparent" />
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              In the studio
            </div>
          </>
        )}

        {readyImages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1">
            {readyImages.map((slot) => (
              <span
                key={slot.index}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  slot.url === activeImage?.url
                    ? "w-5 bg-white"
                    : "w-1.5 bg-white/50",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sneak-peek + honest audio status (the ProductionTeaser content, on-stage) */}
      {streaming && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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

          <div className="mt-3 flex items-center gap-2.5 border-t border-border pt-3 text-sm">
            <span className="flex h-6 items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-primary/70 motion-safe:animate-[pulse_1s_ease-in-out_infinite]"
                  style={{
                    height: `${40 + ((i * 37) % 60)}%`,
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </span>
            <span className="font-medium text-foreground">
              {state.audioUrl ? "Finishing up" : "Producing your audio"}
            </span>
            <span className="ml-auto tabular-nums text-xs text-muted-foreground">
              <ElapsedTimer startedAt={startedAt} running />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
