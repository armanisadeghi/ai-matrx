// features/flashcards/fast-fire/components/FastFireReviewPlayer.tsx
//
// Review playback element. The card being played comes from `audioPlayer.playingCardId`
// in REDUX (state, not a ref — hard-requirement #5; the old playback was dead
// because the player lived in a ref that never re-rendered). When it changes,
// this resolves the card's durable response clip via `useFileSrc` (which re-mints
// signed URLs per the media-durability rules) and autoplays it.

"use client";

import { useEffect, useRef } from "react";
import { useFileSrc } from "@/features/files";
import { useAppDispatch } from "@/lib/redux/hooks";
import { stopPlayback } from "../redux/fastFireSlice";

export function FastFireReviewPlayer({
  fileId,
}: {
  fileId: string | null;
}) {
  const dispatch = useAppDispatch();
  const src = useFileSrc(fileId ? { kind: "file_id", fileId } : null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Autoplay whenever a new clip resolves.
  useEffect(() => {
    if (src && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {
        // Autoplay can be blocked — the visible controls let the user start it.
      });
    }
  }, [src]);

  if (!fileId) return null;

  return (
    <audio
      ref={audioRef}
      src={src ?? undefined}
      controls
      className="mt-2 w-full"
      onEnded={() => dispatch(stopPlayback())}
    />
  );
}
