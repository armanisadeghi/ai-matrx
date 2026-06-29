/**
 * usePlaybackSessionController — bind a phase-based playback hook (no
 * HTMLMediaElement) to the unified audio system.
 *
 * For TTS hooks that drive a Cartesia `WebPlayer` / raw `AudioContext` and track
 * their own play/pause/loading state (e.g. `useCartesiaSpeaker`). Declarative:
 * pass the hook's current `active`/`status`/`label` and its transport controls;
 * this registers a registry session + claims `playbackLock` while active, mirrors
 * status, and ends + releases when idle. The result: ANY consumer of the hook
 * becomes visible in the Audio panel and obeys "one voice at a time" — without
 * the consumer changing at all.
 *
 * Element-based players (`<audio>`/`<video>`) use `useMediaElementPlaybackSession`
 * instead; the unified `playbackQueue` registers its own items.
 */

"use client";

import { useEffect, useRef } from "react";
import {
  claimPlayback,
  releasePlayback,
} from "@/features/audio/playback/playbackLock";
import {
  registerSession,
  updateSession,
  endSession,
  setSessionControls,
} from "./audioSessionRegistry";
import type {
  AudioSessionControls,
  AudioSessionSource,
  AudioSessionStatus,
} from "./types";

export function usePlaybackSessionController(opts: {
  source: AudioSessionSource;
  label: string;
  /** True while loading / playing / paused (i.e. this hook owns output). */
  active: boolean;
  /** Mapped status while active; ignored when not active. */
  status: AudioSessionStatus;
  /** True when the hook ended in an error (vs a clean finish). */
  errored: boolean;
  controls: AudioSessionControls & { stop: () => void };
}) {
  const { source, label, active, status, errored, controls } = opts;
  const idRef = useRef<string | null>(null);
  // Keep the latest controls without writing a ref during render.
  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
  });

  useEffect(() => {
    if (active) {
      let id = idRef.current;
      if (!id) {
        id = registerSession({
          direction: "playback",
          source,
          label,
          status,
          canReplay: false,
        });
        idRef.current = id;
      } else {
        updateSession(id, { status, label });
      }
      setSessionControls(id, {
        pause: () => controlsRef.current.pause?.(),
        resume: () => controlsRef.current.resume?.(),
        stop: () => controlsRef.current.stop(),
      });
      claimPlayback({
        id,
        label,
        stop: () => controlsRef.current.stop(),
      });
    } else {
      const id = idRef.current;
      if (id) {
        endSession(id, errored ? "error" : "done");
        releasePlayback(id);
        idRef.current = null;
      }
    }
  }, [active, status, errored, label, source]);

  // End on unmount.
  useEffect(() => {
    return () => {
      const id = idRef.current;
      if (id) {
        endSession(id, "done");
        releasePlayback(id);
        idRef.current = null;
      }
    };
  }, []);
}
