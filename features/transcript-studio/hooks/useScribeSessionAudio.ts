// features/transcript-studio/hooks/useScribeSessionAudio.ts
//
// The canonical controller for playing a scribe SESSION's audio on the one
// session-relative-seconds timeline the whole studio shares.
//
// THE PROBLEM IT SOLVES
// ---------------------
// A session is NOT one audio file — it is N recording segments, each its own
// `cld_files` blob, each starting at file-time 0 but anchored in the session at
// its `tStart` (seconds from session start, paused time excluded). So "play the
// session at T seconds" means: find the segment whose `[tStart, tEnd]` contains
// T, load that file, seek to `T - tStart`, play — and auto-advance to the next
// segment's file when it ends. Every consumer that needs this (the transport
// player, agent `<audiocite>` citations, transcript rows) was about to
// re-implement that mapping; this hook is the single place it lives.
//
// It owns one `HTMLAudioElement`, resolves each segment's playback URL on demand
// (cached by fileId), and exposes a unified session-time API + transport. It
// subscribes to `scribeAudioBus` so a citation rendered in an unrelated subtree
// (e.g. the Agent tab) can drive playback here.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { getAudioUrl } from "@/features/transcripts/service/audioStorageService";
import { selectRecordingSegments } from "../redux/selectors";
import type { RecordingSegment } from "../types";
import {
  subscribeScribeAudio,
  type ScribeAudioSeekRequest,
} from "../state/scribeAudioBus";

/** A playable segment on the session timeline (has an uploaded audio file). */
export interface PlayableSegment {
  id: string;
  index: number;
  /** Session-relative start, seconds. */
  tStart: number;
  /** Session-relative end, seconds (derived when the row's is null). */
  tEnd: number;
  fileId: string;
}

export interface ScribeSessionAudio {
  /** Playable segments, ordered on the session timeline. */
  segments: PlayableSegment[];
  /** True when at least one segment has an uploaded, playable audio file. */
  hasAudio: boolean;
  isPlaying: boolean;
  /** Whether a URL is currently being resolved (brief, on first play of a segment). */
  isLoading: boolean;
  /** Current position in session-relative seconds. */
  currentTime: number;
  /** Total session timeline length in seconds (last segment's tEnd). */
  duration: number;
  playbackRate: number;
  /** Index into `segments` of the currently-loaded segment, or -1. */
  activeIndex: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Seek to a session-relative second and (by default) play. */
  seekTo: (sessionSeconds: number, opts?: { autoplay?: boolean; endSeconds?: number }) => void;
  /** Skip forward/back by `delta` seconds on the session timeline. */
  skip: (delta: number) => void;
  setPlaybackRate: (rate: number) => void;
  stop: () => void;
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2];
export { PLAYBACK_RATES };

function deriveEnd(seg: RecordingSegment): number {
  if (seg.tEnd != null && seg.tEnd > seg.tStart) return seg.tEnd;
  return seg.tStart;
}

export function useScribeSessionAudio(
  sessionId: string | null,
): ScribeSessionAudio {
  const recordings = useAppSelector(selectRecordingSegments(sessionId));

  const segments = useMemo<PlayableSegment[]>(() => {
    return recordings
      .filter((r) => !!r.audioPath)
      .map((r, i) => ({
        id: r.id,
        index: i,
        tStart: r.tStart,
        tEnd: deriveEnd(r),
        fileId: r.audioPath as string,
      }))
      .sort((a, b) => a.tStart - b.tStart);
  }, [recordings]);

  const duration = useMemo(
    () => segments.reduce((max, s) => Math.max(max, s.tEnd), 0),
    [segments],
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentsRef = useRef<PlayableSegment[]>(segments);
  segmentsRef.current = segments;
  const activeIdxRef = useRef(-1);
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  // Stop playback when the session timeline reaches this point (a cited clip's
  // end). null = play through.
  const stopAtRef = useRef<number | null>(null);
  // Generation token so a stale async URL resolve can't hijack a newer seek.
  const loadTokenRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [playbackRate, setPlaybackRateState] = useState(1);

  // Lazily create the single audio element (SSR-safe — only in the browser).
  const ensureEl = useCallback((): HTMLAudioElement | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = "none";
      audioRef.current = el;
    }
    return audioRef.current;
  }, []);

  const resolveUrl = useCallback(async (fileId: string): Promise<string> => {
    const cached = urlCacheRef.current.get(fileId);
    if (cached) return cached;
    const url = await getAudioUrl(fileId);
    urlCacheRef.current.set(fileId, url);
    return url;
  }, []);

  const setActive = useCallback((idx: number) => {
    activeIdxRef.current = idx;
    setActiveIndex(idx);
  }, []);

  // Load a session-relative second into the element, optionally autoplaying.
  const loadSession = useCallback(
    async (sessionSeconds: number, autoplay: boolean) => {
      const el = ensureEl();
      const segs = segmentsRef.current;
      if (!el || segs.length === 0) return;

      // Find the segment owning this instant; if the time falls in a gap, snap
      // to the next segment that starts at/after it (or the last one).
      let idx = segs.findIndex(
        (s) => sessionSeconds >= s.tStart && sessionSeconds <= s.tEnd,
      );
      if (idx === -1) {
        idx = segs.findIndex((s) => s.tStart >= sessionSeconds);
        if (idx === -1) idx = segs.length - 1;
      }
      const seg = segs[idx];
      if (!seg) return;
      const offset = Math.max(0, sessionSeconds - seg.tStart);

      const token = ++loadTokenRef.current;
      setIsLoading(true);
      try {
        const url = await resolveUrl(seg.fileId);
        if (token !== loadTokenRef.current) return; // superseded by a newer seek
        if (el.src !== url) el.src = url;
        setActive(idx);
        const applyOffset = () => {
          try {
            el.currentTime = offset;
          } catch {
            // metadata not ready yet — retry on loadedmetadata
          }
        };
        if (el.readyState >= 1) applyOffset();
        else el.addEventListener("loadedmetadata", applyOffset, { once: true });
        el.playbackRate = playbackRate;
        if (autoplay) {
          await el.play().catch(() => {
            /* autoplay blocked or interrupted — leave paused */
          });
        }
      } finally {
        if (token === loadTokenRef.current) setIsLoading(false);
      }
    },
    [ensureEl, resolveUrl, setActive, playbackRate],
  );

  const seekTo = useCallback(
    (
      sessionSeconds: number,
      opts?: { autoplay?: boolean; endSeconds?: number },
    ) => {
      stopAtRef.current = opts?.endSeconds ?? null;
      void loadSession(sessionSeconds, opts?.autoplay ?? true);
    },
    [loadSession],
  );

  const play = useCallback(() => {
    const el = ensureEl();
    if (!el) return;
    stopAtRef.current = null;
    if (activeIdxRef.current === -1 && segmentsRef.current.length > 0) {
      void loadSession(segmentsRef.current[0]!.tStart, true);
      return;
    }
    void el.play().catch(() => {});
  }, [ensureEl, loadSession]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const skip = useCallback(
    (delta: number) => {
      const next = Math.min(duration, Math.max(0, currentTime + delta));
      seekTo(next, { autoplay: isPlaying });
    },
    [currentTime, duration, isPlaying, seekTo],
  );

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    stopAtRef.current = null;
  }, []);

  // Wire element events → state, including cross-segment auto-advance.
  useEffect(() => {
    const el = ensureEl();
    if (!el) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onRate = () => setPlaybackRateState(el.playbackRate);
    const onTime = () => {
      const segs = segmentsRef.current;
      const seg = segs[activeIdxRef.current];
      if (!seg) return;
      const sessionT = seg.tStart + el.currentTime;
      setCurrentTime(sessionT);
      const stopAt = stopAtRef.current;
      if (stopAt != null && sessionT >= stopAt) {
        el.pause();
        stopAtRef.current = null;
      }
    };
    const onEnded = () => {
      // Advance to the next segment's file and keep playing the session.
      const segs = segmentsRef.current;
      const nextIdx = activeIdxRef.current + 1;
      if (nextIdx < segs.length) {
        void loadSession(segs[nextIdx]!.tStart, true);
      } else {
        setIsPlaying(false);
      }
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ratechange", onRate);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ratechange", onRate);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
    };
  }, [ensureEl, loadSession]);

  // Tear the element down on unmount so the session doesn't keep the audio warm.
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = "";
      }
      audioRef.current = null;
    };
  }, []);

  // Obey seek requests addressed to this session from anywhere in the app.
  useEffect(() => {
    if (!sessionId) return;
    return subscribeScribeAudio((req: ScribeAudioSeekRequest) => {
      if (req.sessionId !== sessionId) return;
      seekTo(req.sessionSeconds, {
        autoplay: req.autoplay ?? true,
        endSeconds: req.endSeconds,
      });
    });
  }, [sessionId, seekTo]);

  return {
    segments,
    hasAudio: segments.length > 0,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    playbackRate,
    activeIndex,
    play,
    pause,
    toggle,
    seekTo,
    skip,
    setPlaybackRate,
    stop,
  };
}
