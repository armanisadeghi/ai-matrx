"use client";

// app/(core)/podcast/studio/run-refine/[id]/_components/ProductionStage.tsx
//
// The refined live-wait experience. Replaces ProductionTeaser during the long
// audio render with a richer, buffered showcase that does exactly what the
// brief asks:
//   • Shows what we HAVE, not what we don't — ready cover art animates into a
//     rotating showcase (Ken-Burns drift + cross-fade); no placeholder for media
//     that hasn't arrived.
//   • Never lets the user get bored — a buffered moment card (useTeaserBuffer)
//     drips real arrivals (covers, video clips, script turns, finished stages)
//     one at a time so a burst of arrivals doesn't exhaust the tricks early.
//   • Shows how hard we're working — a custom waveform loader for the TTS step
//     plus a live "revealed N of M" counter and elapsed clock.
//
// 100% real: every pixel derives from the live PodcastRunState that the wired
// useStudioRun owns. Media is rendered only via <InlineMediaRef>.

import { useEffect, useState } from "react";
import { AudioLines, ImageIcon, Clapperboard, FileText, CheckCircle2, Palette } from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import { cn } from "@/lib/utils";
import { ElapsedTimer } from "@/features/podcasts/generator/components/ElapsedTimer";
import { podcastMediaRef } from "@/features/podcasts/generator/media";
import { speakerSlot } from "@/features/podcasts/generator/script";
import type { PodcastRunState } from "@/features/podcasts/generator/types";
import { useTeaserBuffer, type TeaserMoment } from "./useTeaserBuffer";

const COVER_ROTATE_MS = 3800;

export function ProductionStage({
  state,
  startedAt,
}: {
  state: PodcastRunState;
  startedAt: number | null;
}) {
  const rtl = state.podcastType === "persian";
  const readyImages = state.images.filter((s) => s.status === "done" && s.url);
  const { current, queued, revealed } = useTeaserBuffer(state);

  // Rotate the cover showcase among the covers that have ACTUALLY landed.
  const [coverTick, setCoverTick] = useState(0);
  useEffect(() => {
    if (readyImages.length <= 1) return;
    const id = setInterval(() => setCoverTick((t) => t + 1), COVER_ROTATE_MS);
    return () => clearInterval(id);
  }, [readyImages.length]);
  const activeCover = readyImages.length
    ? readyImages[coverTick % readyImages.length]
    : null;

  return (
    <div className="pcr pcr-card-in overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid gap-0 sm:grid-cols-[minmax(0,280px)_1fr]">
        {/* ── LEFT: the cover showcase — what we already HAVE ─────────────── */}
        <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-muted via-accent/20 to-muted">
          {readyImages.map((slot) => {
            const isActive = slot.url === activeCover?.url;
            return (
              <div
                key={slot.index}
                className={cn(
                  "absolute inset-0 transition-opacity duration-1000",
                  isActive ? "z-10 opacity-100" : "z-0 opacity-0",
                )}
              >
                <div className={cn("h-full w-full", isActive && "pcr-kenburns")}>
                  <InlineMediaRef
                    ref={podcastMediaRef(slot.url)}
                    size="fill"
                    fit="cover"
                    alt="Cover concept"
                    fallback="skeleton"
                  />
                </div>
              </div>
            );
          })}

          {/* No covers yet — a calm custom loader, never a broken placeholder. */}
          {readyImages.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground/50">
              <Palette className="h-9 w-9 animate-pulse" />
              <span className="text-xs font-medium">Designing the cover…</span>
            </div>
          )}

          {/* Count + dots over the showcase. */}
          {readyImages.length > 0 && (
            <>
              <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                <ImageIcon className="h-3.5 w-3.5" />
                {readyImages.length} cover{readyImages.length > 1 ? "s" : ""} ready
              </span>
              {readyImages.length > 1 && (
                <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
                  {readyImages.map((slot) => (
                    <span
                      key={slot.index}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-500",
                        slot.url === activeCover?.url
                          ? "w-5 bg-white"
                          : "w-1.5 bg-white/50",
                      )}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT: the buffered moment + the honest audio status ────────── */}
        <div className="flex min-w-0 flex-col p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              In the studio
            </span>
            {revealed > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {revealed} milestone{revealed > 1 ? "s" : ""} so far
                {queued > 0 && (
                  <span className="ml-1 text-primary/70">· {queued} queued</span>
                )}
              </span>
            )}
          </div>

          {/* The buffered feature card — fixed height so swapping content never
              shifts the layout. */}
          <div
            className="relative min-h-[10.5rem] flex-1"
            dir={rtl ? "rtl" : undefined}
          >
            {current ? (
              <MomentCard key={current.id} moment={current} />
            ) : (
              <div className="flex h-full flex-col justify-center gap-2 text-muted-foreground">
                <p className="text-sm font-medium text-foreground">
                  {state.title || "Producing your episode…"}
                </p>
                <p className="text-sm leading-relaxed">
                  Warming up — the first results are on their way.
                </p>
              </div>
            )}
          </div>

          {/* Honest audio status with a custom waveform loader. */}
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-3 text-sm">
            <span className="flex h-6 items-end gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="pcr-wave-bar h-full"
                  style={{ animationDelay: `${i * 0.11}s` }}
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

// One buffered moment, rendered by kind. Each animates in on reveal.
function MomentCard({ moment }: { moment: TeaserMoment }) {
  if (moment.kind === "cover" || moment.kind === "video") {
    const isVideo = moment.kind === "video";
    return (
      <div className="pcr-reveal flex h-full gap-3">
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-xl border border-border bg-muted",
            isVideo ? "aspect-video w-36" : "aspect-square w-28",
          )}
        >
          <InlineMediaRef
            ref={podcastMediaRef(moment.url)}
            as={isVideo ? "video" : "img"}
            size="fill"
            fit="cover"
            rounded="none"
            autoPlay={isVideo}
            muted={isVideo}
            loop={isVideo}
            playsInline={isVideo}
            alt={isVideo ? "Video clip" : "Cover concept"}
            fallback="skeleton"
          />
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <span className="mb-1 inline-flex w-fit items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            {isVideo ? (
              <Clapperboard className="h-3.5 w-3.5" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            {isVideo ? "A video clip just landed" : "A cover just landed"}
          </span>
          <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
            {moment.prompt || "A fresh visual for your episode."}
          </p>
        </div>
      </div>
    );
  }

  if (moment.kind === "dialogue") {
    return (
      <div className="pcr-reveal">
        <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          <FileText className="h-3.5 w-3.5" />
          Sneak peek of the conversation
        </p>
        <div className="space-y-2">
          {moment.turns.map((turn, i) => (
            <p key={i} className="text-sm leading-relaxed">
              <span
                className={cn(
                  "font-semibold",
                  speakerSlot(turn.speaker, moment.speakers) === 0
                    ? "text-primary"
                    : "text-secondary",
                )}
              >
                {turn.speaker}:
              </span>{" "}
              <span className="text-muted-foreground">
                {turn.text.slice(0, 190)}
                {turn.text.length > 190 ? "…" : ""}
              </span>
            </p>
          ))}
        </div>
      </div>
    );
  }

  if (moment.kind === "stage") {
    return (
      <div className="pcr-reveal flex h-full flex-col justify-center gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Step complete
        </span>
        <p className="text-base font-medium text-foreground">{moment.label}</p>
        <p className="text-sm text-muted-foreground">
          One more piece of your episode is in the can.
        </p>
      </div>
    );
  }

  if (moment.kind === "title") {
    return (
      <div className="pcr-reveal flex h-full flex-col justify-center gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <AudioLines className="h-3.5 w-3.5" />
          Your episode has a name
        </span>
        <p className="text-lg font-semibold leading-tight text-foreground">
          {moment.title}
        </p>
      </div>
    );
  }

  // description
  return (
    <div className="pcr-reveal flex h-full flex-col justify-center gap-2">
      <span className="inline-flex w-fit items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        <FileText className="h-3.5 w-3.5" />
        About this episode
      </span>
      <p className="line-clamp-5 text-sm leading-relaxed text-muted-foreground">
        {moment.text}
      </p>
    </div>
  );
}
