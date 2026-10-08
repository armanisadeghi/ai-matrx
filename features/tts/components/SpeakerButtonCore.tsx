/**
 * SpeakerButtonCore — Single play/pause toggle (dynamically imported)
 *
 * Uses Volume2TapButton / PauseTapButton from the tap-buttons system.
 * Forwards variant prop so it works in any context (standalone, group, etc).
 * Shape never changes — one button, always.
 */

"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { ReadAloudButton, type ReadAloudStatus } from "@ai-matrx/media/react";
import { useSpeech } from "@/features/audio/service/useSpeech";
import type { SpeakerVariant } from "../types";

export interface SpeakerButtonCoreProps {
  text: string;
  processMarkdown?: boolean;
  autoStart?: boolean;
  variant?: SpeakerVariant;
  className?: string;
  disabled?: boolean;
}

/** The audio queue's item status, in the shared read-aloud button's vocabulary. */
function readAloudStatus(status: ReturnType<typeof useSpeech>["status"]): ReadAloudStatus {
  if (status === "playing") return "playing";
  if (status === "paused") return "paused";
  if (status === "loading" || status === "queued") return "loading";
  if (status === "error") return "error";
  return "idle";
}

export default function SpeakerButtonCore({
  text,
  processMarkdown = true,
  autoStart = false,
  variant,
  className,
  disabled = false,
}: SpeakerButtonCoreProps) {
  const { speak, status, pause, resume } = useSpeech({ processMarkdown });
  const state = readAloudStatus(status);

  const autoStartFired = useRef(false);

  useEffect(() => {
    if (!autoStart || autoStartFired.current) return;
    autoStartFired.current = true;
    speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = useCallback(async () => {
    if (disabled || state === "loading") return;
    if (state === "playing") await pause();
    else if (state === "paused") await resume();
    else speak(text);
  }, [disabled, state, text, speak, pause, resume]);

  return (
    <ReadAloudButton
      status={state}
      onPress={() => void handlePress()}
      disabled={disabled}
      variant={variant}
      className={className}
      label="Play audio"
    />
  );
}
