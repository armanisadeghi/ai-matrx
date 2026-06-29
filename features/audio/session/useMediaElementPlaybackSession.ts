/**
 * useMediaElementPlaybackSession — bind an `<audio>`/`<video>` element to the
 * unified audio system.
 *
 * Any surface that drives a raw `HTMLMediaElement` (the podcast player, voice
 * messages, …) uses this to join the single audio system instead of playing in
 * the dark: while it plays it claims `playbackLock` (so it stops — and is
 * stopped by — every other audio path) and registers a session in the
 * `audioSessionRegistry` (so the Audio panel can see and control it).
 *
 * Drive `isPlaying` from the element's REAL `play`/`pause` events (single source
 * of truth) — that way a lock takeover, which pauses the element, flows straight
 * back into the UI. The session is registered once per track, kept across
 * pause/resume (status flips), and ended on track-change / unmount.
 */

"use client";

import { useEffect, useRef, type RefObject } from "react";
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
import type { AudioSessionSource } from "./types";

export function useMediaElementPlaybackSession(opts: {
  elementRef: RefObject<HTMLMediaElement | null>;
  /** Whether the element is currently playing (drive from real play/pause events). */
  isPlaying: boolean;
  source: AudioSessionSource;
  label: string;
  /** A new value ends the current session and starts fresh (new track/source). */
  trackKey?: string;
}) {
  const { elementRef, isPlaying, source, label, trackKey } = opts;
  // Read/written only inside effects (never during render) — the React rules
  // forbid touching a ref's `.current` while rendering.
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const safeLabel = label || "Audio";
    if (isPlaying) {
      let id = sessionIdRef.current;
      if (!id) {
        id = registerSession({
          direction: "playback",
          source,
          label: safeLabel,
          status: "active",
          canReplay: false,
        });
        sessionIdRef.current = id;
      } else {
        updateSession(id, { status: "active", label: safeLabel });
      }
      const sid = id;
      setSessionControls(sid, {
        pause: () => elementRef.current?.pause(),
        resume: () => void elementRef.current?.play().catch(() => {}),
        stop: () => elementRef.current?.pause(),
        replay: () => {
          const e = elementRef.current;
          if (!e) return;
          e.currentTime = 0;
          void e.play().catch(() => {});
        },
      });
      // Claim AFTER registering so the panel always has a session for the
      // holder. The takeover handler pauses the element (→ 'pause' event → UI)
      // and marks the session paused.
      claimPlayback({
        id: sid,
        label: safeLabel,
        stop: () => {
          const el = elementRef.current;
          if (el && !el.paused) el.pause();
          updateSession(sid, { status: "paused" });
          releasePlayback(sid);
        },
      });
    } else {
      const id = sessionIdRef.current;
      if (id) {
        updateSession(id, { status: "paused" });
        releasePlayback(id);
      }
    }
  }, [isPlaying, source, label, elementRef]);

  // End the session on a new track or unmount (the cleanup covers both).
  useEffect(() => {
    return () => {
      const id = sessionIdRef.current;
      if (id) {
        endSession(id, "done");
        releasePlayback(id);
        sessionIdRef.current = null;
      }
    };
  }, [trackKey]);
}
