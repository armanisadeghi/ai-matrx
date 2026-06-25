/**
 * SpeakerGroupCore — Variant 2: 3-button group (Play, Pause, Stop)
 *
 * All three buttons permanently rendered inside TapTargetButtonGroup.
 * Uses PlayTapButton / PauseTapButton / StopTapButton from tap-buttons.
 * Shape never changes. Unavailable actions are disabled.
 */

"use client";

import React, { useEffect, useRef } from "react";
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
  /** Dictionary surface whose pronunciations to apply to the spoken text. */
  dictionarySurfaceKey?: string;
}

export default function SpeakerGroupCore({
  text,
  processMarkdown = true,
  autoStart = false,
  className,
  disabled = false,
  dictionarySurfaceKey,
}: Props) {
  const { speak, status, itemId, pause, resume, remove } = useTtsSpeak({
    processMarkdown,
    dictionarySurfaceKey,
  });

  const isPlaying = status === "playing";
  const isPaused = status === "paused";
  const isLoading = status === "loading" || status === "queued";

  const autoStartFired = useRef(false);

  useEffect(() => {
    if (!autoStart || autoStartFired.current) return;
    autoStartFired.current = true;
    speak(text);
  }, []);

  const canPlay = !disabled && !isLoading && !isPlaying;
  const canPause = !disabled && isPlaying;
  const canStop = !disabled && (isPlaying || isPaused);

  const handlePlay = async () => {
    if (isPaused) await resume();
    else speak(text);
  };

  const stop = () => {
    if (itemId) void remove(itemId);
  };

  return (
    <TapTargetButtonGroup className={className}>
      <PlayTapButton
        variant="group"
        onClick={handlePlay}
        disabled={!canPlay}
        ariaLabel={isPaused ? "Resume" : "Play"}
      />
      <PauseTapButton
        variant="group"
        onClick={pause}
        disabled={!canPause}
        ariaLabel="Pause"
      />
      <StopTapButton
        variant="group"
        onClick={stop}
        disabled={!canStop}
        ariaLabel="Stop"
      />
    </TapTargetButtonGroup>
  );
}
