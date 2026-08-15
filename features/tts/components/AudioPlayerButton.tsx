/**
 * AudioPlayerButton — play this text aloud.
 *
 * Speaks through the ONE AV service (`useSpeech`) on the catalog engine, so the
 * utterance joins the single playback queue: it is visible and controllable in
 * the Media panel, it cannot overlap another voice, and the engine can be
 * swapped in one place. It used to drive its own `<audio>` element through a
 * second speak path (`useTextToSpeech`, now deleted) that only this button used.
 */

"use client";

import React, { useCallback } from "react";
import { Volume2, VolumeX, Loader2, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/features/audio/service/useSpeech";
import { useAppSelector } from "@/lib/redux/hooks";
import type { EnglishVoice } from "../types";

export interface AudioPlayerButtonProps {
  text: string;
  voice?: EnglishVoice;
  processMarkdown?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  className?: string;
  iconOnly?: boolean;
  showTooltip?: boolean;
}

export function AudioPlayerButton({
  text,
  voice,
  processMarkdown,
  size = "sm",
  variant = "ghost",
  className,
  iconOnly = true,
  showTooltip = true,
}: AudioPlayerButtonProps) {
  // Get user's preferred voice from userPreferences
  const preferredVoice = useAppSelector(
    (state) =>
      state.userPreferences?.textToSpeech?.preferredVoice || "troy",
  );
  const shouldProcessMarkdown = useAppSelector(
    (state) => state.userPreferences?.textToSpeech?.processMarkdown ?? true,
  );

  // Use voice from props or fall back to user preference
  const selectedVoice = voice || preferredVoice;
  const shouldProcess = processMarkdown ?? shouldProcessMarkdown;

  const { speak, status, itemId, pause, resume, remove } = useSpeech({
    engine: "catalog",
    voice: selectedVoice,
    processMarkdown: shouldProcess,
  });

  // The queue owns the truth: loading = synthesizing, playing/paused as named.
  // Errors surface as the queue item's status (and in the Media panel), so this
  // button no longer needs its own error toast.
  //
  // `queued` counts as busy — same as every sibling speaker. Something else is
  // playing and our utterance is waiting its turn; treating that as idle lets a
  // second click enqueue the SAME text twice, and the user hears it spoken
  // twice in a row.
  const isGenerating = status === "loading" || status === "queued";
  const isPlaying = status === "playing";
  const isPaused = status === "paused";

  const handleClick = useCallback(() => {
    if (isPlaying) pause();
    else if (isPaused) resume();
    else speak(text);
  }, [isPlaying, isPaused, text, speak, pause, resume]);

  const handleStop = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (itemId) remove(itemId);
    },
    [itemId, remove],
  );

  // Determine icon
  const Icon = isGenerating
    ? Loader2
    : isPaused
      ? Volume2
      : isPlaying
        ? Pause
        : Volume2;

  // Icon size mapping
  const iconSizeMap = {
    default: "h-4 w-4",
    sm: "h-3.5 w-3.5",
    lg: "h-5 w-5",
    icon: "h-4 w-4",
  };

  const iconSize = iconSizeMap[size];

  const isQueued = status === "queued";
  const tooltipText = isQueued
    ? "Waiting for the current audio to finish"
    : isGenerating
    ? "Generating speech..."
    : isPlaying
      ? "Pause"
      : isPaused
        ? "Resume"
        : "Play audio";

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handleClick}
        disabled={isGenerating || !text.trim()}
        className={cn("transition-all", className)}
        title={showTooltip ? tooltipText : undefined}
      >
        <Icon className={cn(iconSize, isGenerating && "animate-spin")} />
        {!iconOnly && (
          <span className="ml-2">
            {isQueued
              ? "Waiting..."
              : isGenerating
              ? "Generating..."
              : isPlaying
                ? "Pause"
                : isPaused
                  ? "Resume"
                  : "Play"}
          </span>
        )}
      </Button>

      {(isPlaying || isPaused) && (
        <Button
          type="button"
          size={size}
          variant="ghost"
          onClick={handleStop}
          className={cn("h-7 w-7 p-0", className)}
          title="Stop"
        >
          <VolumeX className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
