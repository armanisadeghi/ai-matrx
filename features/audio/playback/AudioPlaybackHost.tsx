/**
 * AudioPlaybackHost — bridges the framework-free `playbackQueue` singleton into
 * Redux so the window-panel UI and Speaker buttons can render queue state.
 *
 * Mounted once at app root (app/Providers.tsx), sibling of GlobalRecordingProvider
 * (audio IN) and AudioOutputHost (legacy streaming read-aloud). This host is
 * intentionally lightweight: it imports only the queue's subscribe API — NOT the
 * provider adapters — so no TTS SDK lands in the app shell. Adapters load lazily
 * inside the queue on the first `speak`.
 */

"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { playbackSnapshotUpdated } from "@/lib/redux/slices/audioPlaybackSlice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { subscribePlayback } from "./playbackQueue";
import { subscribePlaybackLock } from "./playbackLock";

const AUDIO_PANEL_OVERLAY_ID = "audioControlWindow";

export function AudioPlaybackHost() {
  const dispatch = useAppDispatch();
  // Rising-edge guard so we surface the panel once when audio gets "complex"
  // (something queued, or a cross-path takeover), not on every snapshot.
  const hadPendingRef = useRef(false);

  useEffect(() => {
    const surfacePanel = () =>
      dispatch(openOverlay({ overlayId: AUDIO_PANEL_OVERLAY_ID }));

    const unsubQueue = subscribePlayback((snapshot) => {
      dispatch(
        playbackSnapshotUpdated({
          items: snapshot.items,
          currentId: snapshot.currentId,
          rate: snapshot.rate,
        }),
      );
      // Auto-open when a second utterance lines up behind the active one.
      // `currentId` must be set: enqueuePlayback notifies BEFORE startItem
      // claims the first item, so a lone first utterance briefly reads as
      // "queued" while nothing is active — that snapshot must NOT open the
      // panel (it made every first Speak click pop the Media window over
      // whatever the user was doing).
      const hasPending =
        snapshot.currentId !== null &&
        snapshot.items.some((i) => i.status === "queued");
      if (hasPending && !hadPendingRef.current) surfacePanel();
      hadPendingRef.current = hasPending;
    });

    // Auto-open on any cross-path takeover (e.g. War Room read-aloud preempting
    // a queued utterance) — exactly the "it got complex" moment the user wants
    // visible.
    const unsubLock = subscribePlaybackLock((event) => {
      if (event.preempted) surfacePanel();
    });

    return () => {
      unsubQueue();
      unsubLock();
    };
  }, [dispatch]);

  return null;
}
