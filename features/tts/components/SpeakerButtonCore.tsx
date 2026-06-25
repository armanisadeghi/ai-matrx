/**
 * SpeakerButtonCore — Single play/pause toggle (dynamically imported)
 *
 * Uses Volume2TapButton / PauseTapButton from the tap-buttons system.
 * Forwards variant prop so it works in any context (standalone, group, etc).
 * Shape never changes — one button, always.
 */

"use client";

import React, { useEffect, useRef, useCallback } from "react";
import {
  Volume2TapButton,
  PauseTapButton,
} from "@/components/icons/tap-buttons";
import { useTtsSpeak } from "@/features/audio/playback/useTtsSpeak";
import type { SpeakerVariant } from "../types";

export interface SpeakerButtonCoreProps {
  text: string;
  processMarkdown?: boolean;
  autoStart?: boolean;
  variant?: SpeakerVariant;
  className?: string;
  disabled?: boolean;
}

export default function SpeakerButtonCore({
  text,
  processMarkdown = true,
  autoStart = false,
  variant,
  className,
  disabled = false,
}: SpeakerButtonCoreProps) {
  const { speak, status, pause, resume } = useTtsSpeak({ processMarkdown });

  const isPlaying = status === "playing";
  const isPaused = status === "paused";
  const isLoading = status === "loading" || status === "queued";

  const autoStartFired = useRef(false);

  useEffect(() => {
    if (!autoStart || autoStartFired.current) return;
    autoStartFired.current = true;
    speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(async () => {
    if (disabled || isLoading) return;
    if (isPlaying) await pause();
    else if (isPaused) await resume();
    else speak(text);
  }, [disabled, isLoading, isPlaying, isPaused, text, speak, pause, resume]);

  if (isPlaying) {
    return (
      <PauseTapButton
        variant={variant}
        onClick={handleClick}
        disabled={disabled}
        ariaLabel="Pause"
        className={className}
      />
    );
  }

  return (
    <Volume2TapButton
      variant={variant}
      onClick={handleClick}
      disabled={disabled || isLoading}
      ariaLabel={isLoading ? "Connecting…" : isPaused ? "Resume" : "Play audio"}
      className={className}
    />
  );
}
