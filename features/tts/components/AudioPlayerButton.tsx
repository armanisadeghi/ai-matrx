/**
 * Audio Player Button Component
 *
 * Simple button that generates and plays text-to-speech
 */

"use client";

import React, { useCallback } from "react";
import { Volume2, VolumeX, Loader2, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTextToSpeech } from "../hooks/useTextToSpeech";
import { useAppSelector } from "@/lib/redux/hooks";
import type { EnglishVoice } from "../types";
import { toast } from "sonner";

export interface AudioPlayerButtonProps {
  text: string;
  voice?: EnglishVoice;
  processMarkdown?: boolean;
  autoPlay?: boolean;
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
  autoPlay = true,
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

  const { isGenerating, isPlaying, isPaused, speak, pause, resume, stop } =
    useTextToSpeech({
      defaultVoice: selectedVoice,
      autoPlay,
      processMarkdown: shouldProcess,
      onError: (error) => {
        toast.error("Speech playback failed", {
          description: error,
        });
      },
    });

  const handleClick = useCallback(async () => {
    if (isPlaying) {
      if (isPaused) {
        await resume();
      } else {
        pause();
      }
    } else if (isPaused) {
      await resume();
    } else {
      await speak(text);
    }
  }, [isPlaying, isPaused, text, speak, pause, resume]);

  const handleStop = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      stop();
    },
    [stop],
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

  const tooltipText = isGenerating
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
            {isGenerating
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
