// features/flashcards/fast-fire/components/FastFireReviewPlayer.tsx
//
// Review playback element. The card's durable response clip is resolved via
// `useFileSrc` (which re-mints signed URLs per the media-durability rules) and the
// NATIVE <audio> controls drive playback.
//
// MOBILE-FIRST (M3): the element is ALWAYS mounted (with visible native controls)
// whenever the row has audio — never mounted-on-demand-then-autoplayed. iOS Safari
// blocks `.play()` that is not called synchronously inside a user gesture, and the
// old "mount on play, then .play() in an async effect after the src resolves" path
// always tripped that block (the src resolves a tick later, off-gesture). With the
// element persistent and controls visible, the user's tap on the native play
// button IS the gesture — no second tap, no blocked autoplay. Redux
// `audioPlayer.playingCardId` still tracks which row is active for the surrounding
// UI; playback itself is owned by the native element.

"use client";

import { useFileSrc } from "@/features/files";
import { useAppDispatch } from "@/lib/redux/hooks";
import { playCard, stopPlayback } from "../redux/fastFireSlice";

export function FastFireReviewPlayer({
  fileId,
  cardId,
}: {
  fileId: string | null;
  cardId: string;
}) {
  const dispatch = useAppDispatch();
  const src = useFileSrc(fileId ? { kind: "file_id", fileId } : null);

  if (!fileId) return null;

  return (
    <audio
      src={src ?? undefined}
      controls
      preload="none"
      className="mt-2 w-full"
      // Keep Redux's active-row marker in sync with the native transport so the
      // surrounding Play/Pause affordance reflects real playback state.
      onPlay={() => dispatch(playCard({ cardId }))}
      onPause={() => dispatch(stopPlayback())}
      onEnded={() => dispatch(stopPlayback())}
    />
  );
}
