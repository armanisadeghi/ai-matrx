"use client";

// features/podcasts/generator/useVoiceSamplePlayer.ts
//
// One-at-a-time audio sample playback for the voice picker. A single shared
// <audio> element plays whichever voice sample was last requested; starting a
// new one stops the previous. Returns the currently-playing/loading voice value
// so callers can render the right play/stop/spinner state per row.

import { useEffect, useRef, useState } from "react";

export interface VoiceSamplePlayer {
  /** Voice value currently playing, or null. */
  playingValue: string | null;
  /** Voice value currently buffering (play() pending), or null. */
  loadingValue: string | null;
  /** Toggle a voice sample: plays it (stopping any other), or stops it if it's
   *  the one already playing. No-op when `url` is falsy. */
  toggle: (value: string, url: string | undefined) => void;
  /** Stop whatever is playing. */
  stop: () => void;
}

export function useVoiceSamplePlayer(): VoiceSamplePlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingValue, setPlayingValue] = useState<string | null>(null);
  const [loadingValue, setLoadingValue] = useState<string | null>(null);

  // Tear down the element on unmount so a sample never keeps playing after the
  // editor closes.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function stop() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingValue(null);
    setLoadingValue(null);
  }

  function toggle(value: string, url: string | undefined) {
    if (!url) return;
    if (playingValue === value) {
      stop();
      return;
    }
    audioRef.current?.pause();
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = url;
    audio.onended = () => setPlayingValue(null);
    audio.onerror = () => {
      setLoadingValue(null);
      setPlayingValue(null);
    };
    setLoadingValue(value);
    void audio
      .play()
      .then(() => {
        setLoadingValue(null);
        setPlayingValue(value);
      })
      .catch(() => {
        // Autoplay block / network error — fail quietly to a stopped state.
        setLoadingValue(null);
        setPlayingValue(null);
      });
  }

  return { playingValue, loadingValue, toggle, stop };
}
