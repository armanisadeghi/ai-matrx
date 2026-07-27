"use client";

/**
 * AudioSystemHost — the ONE audio mount in app/Providers.tsx.
 *
 * Paper-thin gate over the entire audio system (recording engine, TTS output
 * speaker, playback-queue + session-registry Redux mirrors, device manager,
 * audio modal, crash recovery). Renders null — and fetches NOTHING — until the
 * user's first audio engagement; then `AudioSystemHostImpl` mounts once and
 * stays mounted for the life of the tab (the latch never resets).
 *
 * Engagement signals (any one mounts the system):
 *   1. The activation latch (`features/audio/activation.ts`) — fired inside
 *      the framework-free entry points: playbackQueue enqueue/play/resume,
 *      voicePlaybackBus real requests, showAudioModal, captureLock claims,
 *      recordingCommands.start, the audioControlWindow opener.
 *   2. The `audioControlWindow` overlay being open in Redux — covers opens
 *      that bypass the opener hook (extension bridge, persisted window
 *      restore, URL hydration).
 *   3. Post-idle: the dirty-recording boot marker (localStorage) — a previous
 *      session crashed mid-recording, so activate and let the recovery scan
 *      surface the orphaned audio without any user gesture.
 *
 * State dispatched before the Impl mounts is never lost: the audio slices are
 * always registered, and the framework-free singletons (playbackQueue,
 * audioSessionRegistry, voicePlaybackBus, audioModal, recordingCommands)
 * accumulate state / queue commands and replay on subscribe/register.
 *
 * ONE-BOUNDARY LAW: this is the single `ssr:false` dynamic boundary for the
 * audio system. Everything inside `AudioSystemHostImpl` imports statically —
 * except leaves that are themselves condition-gated on rare events (the
 * recovery toast body, the audio modal body), which follow the
 * OverlayController leaf pattern.
 */

import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";
import {
  activateAudio,
  isAudioActivated,
  subscribeAudioActivation,
} from "@/features/audio/activation";
import { hasAudioBootMarker } from "@/features/audio/audioBootMarker";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { useIdleReady } from "@/utils/idle-scheduler";

const AudioSystemHostImpl = dynamic(() => import("./AudioSystemHostImpl"), {
  ssr: false,
  loading: () => null,
});

export function AudioSystemHost() {
  const activated = useSyncExternalStore(
    subscribeAudioActivation,
    isAudioActivated,
    () => false,
  );
  const panelOpen = useAppSelector((s) =>
    selectIsOverlayOpen(s, "audioControlWindow"),
  );

  // Crash recovery: post-idle, a dirty-recording marker from a previous
  // session activates the system so the orphan scan runs with no gesture.
  const idle = useIdleReady();
  useEffect(() => {
    if (idle && hasAudioBootMarker()) activateAudio();
  }, [idle]);

  if (!activated && !panelOpen) return null;
  return <AudioSystemHostImpl />;
}
