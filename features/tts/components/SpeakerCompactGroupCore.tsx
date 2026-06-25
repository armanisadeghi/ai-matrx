/**
 * SpeakerCompactGroupCore — Variant 3: 2-button group (Play/Pause toggle + Stop)
 *
 * Both buttons permanently rendered inside TapTargetButtonGroup.
 * Uses PlayTapButton / PauseTapButton / StopTapButton from tap-buttons.
 * Shape never changes. Unavailable actions are disabled.
 */

"use client";

import React, { useEffect, useRef, useCallback } from "react";
import {
  PlayTapButton,
  PauseTapButton,
  StopTapButton,
} from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { useTtsSpeak } from "@/features/audio/playback/useTtsSpeak";

interface Props {
  text: string;
  processMarkdown?: boolean;
  autoStart?: boolean;
  className?: string;
  disabled?: boolean;
}

export default function SpeakerCompactGroupCore({
  text,
  processMarkdown = true,
  autoStart = false,
  className,
  disabled = false,
}: Props) {
  const { speak, status, itemId, pause, resume, remove } = useTtsSpeak({
    processMarkdown,
  });

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

  const handleToggle = useCallback(async () => {
    if (isPlaying) await pause();
    else if (isPaused) await resume();
    else speak(text);
  }, [isPlaying, isPaused, text, speak, pause, resume]);

  const stop = useCallback(() => {
    if (itemId) void remove(itemId);
  }, [itemId, remove]);

  const toggleDisabled = disabled || isLoading;
  const stopDisabled = disabled || (!isPlaying && !isPaused);

  const ToggleButton = isPlaying ? PauseTapButton : PlayTapButton;

  return (
    <TapTargetButtonGroup className={className}>
      <ToggleButton
        variant="group"
        onClick={handleToggle}
        disabled={toggleDisabled}
        ariaLabel={isPlaying ? "Pause" : isPaused ? "Resume" : "Play"}
      />
      <StopTapButton
        variant="group"
        onClick={stop}
        disabled={stopDisabled}
        ariaLabel="Stop"
      />
    </TapTargetButtonGroup>
  );
}
