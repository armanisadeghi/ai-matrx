"use client";

// features/flashcards/fast-fire/components/FastFireReviewPlaylist.tsx
//
// "Play all" for the review list (spec 26b — Review All / Correct / Best are
// PLAYBACK modes, not just list filters): plays every clip in the current
// filter sequentially. iOS rule (same constraint FastFireReviewPlayer
// documents): playback starts ONLY from the user's tap, and continuation uses
// ONE persistent <audio> element whose src swaps inside the `ended` handler —
// an element unlocked by the initial gesture stays unlocked, so `.play()` in
// `onEnded` is allowed; a `.play()` in an async effect is not. The NEXT clip's
// URL is pre-resolved (lookahead of 1) so the swap is synchronous.

import { useRef, useState } from "react";
import { ListMusic, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectReviewRows } from "../redux/fastFire.selectors";
import { playCard, stopPlayback } from "../redux/fastFireSlice";
import CardFaceContent from "@/components/mardown-display/blocks/flashcards/CardFaceContent";

export function FastFireReviewPlaylist() {
  const dispatch = useAppDispatch();
  const rows = useAppSelector(selectReviewRows);
  const playable = rows.filter((r) => !!r.grade?.responseAudioFileId);

  // Index into `playable`; -1 = transport idle.
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const current = index >= 0 ? playable[index] : undefined;
  const next = index >= 0 ? playable[index + 1] : playable[0];
  const currentSrc = useFileSrc(
    current?.grade?.responseAudioFileId
      ? { kind: "file_id", fileId: current.grade.responseAudioFileId }
      : null,
  );
  // Lookahead: resolving the next clip's URL NOW is what lets the `ended`
  // handler swap + play synchronously (no async mint mid-chain).
  useFileSrc(
    next?.grade?.responseAudioFileId
      ? { kind: "file_id", fileId: next.grade.responseAudioFileId }
      : null,
  );

  if (playable.length === 0) return null;

  const stop = () => {
    audioRef.current?.pause();
    setIndex(-1);
    setPlaying(false);
    dispatch(stopPlayback());
  };

  const playIndex = (i: number) => {
    if (i >= playable.length) {
      stop();
      return;
    }
    setIndex(i);
    setPlaying(true);
    dispatch(playCard({ cardId: playable[i].card.id }));
  };

  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      {index === -1 ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          // The tap IS the gesture: the element mounts with the first clip's
          // src and autoPlay, unlocked by this click.
          onClick={() => playIndex(0)}
        >
          <ListMusic className="h-4 w-4" />
          Play all ({playable.length})
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => {
              const el = audioRef.current;
              if (!el) return;
              if (playing) {
                el.pause();
                setPlaying(false);
              } else {
                void el.play();
                setPlaying(true);
              }
            }}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-muted-foreground"
            onClick={stop}
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {index + 1}/{playable.length}
            </span>
            {current && (
              <span className="ml-2">
                <CardFaceContent
                  content={current.card.front}
                  variant="inline"
                  className="line-clamp-1 inline"
                />
              </span>
            )}
          </div>
        </>
      )}
      {index >= 0 && (
        <audio
          ref={audioRef}
          src={currentSrc ?? undefined}
          autoPlay
          preload="auto"
          className="sr-only"
          onEnded={() => playIndex(index + 1)}
          onError={() => playIndex(index + 1)}
        >
          <track kind="captions" />
        </audio>
      )}
    </div>
  );
}
