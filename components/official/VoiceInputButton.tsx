/**
 * Voice Input Button Component
 *
 * Complete voice input button with recording and transcription
 * Handles all recording, transcription, and state management internally
 * Available in two variants: 'button' (with text) or 'inline' (icon only)
 *
 * @official-component
 */

"use client";

import React, { useCallback, useState } from "react";
import { AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceCapture } from "@/features/audio/hooks/useVoiceCapture";
import { cn } from "@/lib/utils";
import { MicrophoneButton } from "@/features/audio/components/MicrophoneButton";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { RecordingIndicator } from "@/features/audio/components/RecordingIndicator";
import { VoiceTroubleshootingModal } from "@/features/audio/components/VoiceTroubleshootingModal";
import { toast } from "sonner";

export interface VoiceInputButtonProps {
  onTranscriptionComplete: (text: string) => void;
  onError?: (error: string) => void;
  variant?: "button" | "inline";
  buttonText?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}

export function VoiceInputButton({
  onTranscriptionComplete,
  onError,
  variant = "inline",
  buttonText = "Explain it Instead",
  size = "md",
  className,
  disabled = false,
}: VoiceInputButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [lastError, setLastError] = useState<{
    message: string;
    code: string;
  } | null>(null);

  // Rides the ONE shared recorder (start-always-wins, one-at-a-time, survives
  // navigation, crash-safe). This button emits text rather than filling a
  // field, so it consumes `useVoiceCapture` directly.
  const {
    isRecording,
    isTranscribing,
    durationSec: duration,
    audioLevel,
    liveTranscript,
    start,
    stop,
  } = useVoiceCapture({
    label: buttonText,
    onTranscript: (finalText) => {
      if (finalText) {
        onTranscriptionComplete(finalText);
      }
      setIsExpanded(false);
    },
    onError: (error, errorCode) => {
      setLastError({ message: error, code: errorCode || "UNKNOWN_ERROR" });
      toast.error("Voice input failed", {
        description: error,
        duration: 10000,
        action: {
          label: "Get Help",
          onClick: () => setShowTroubleshooting(true),
        },
      });
      onError?.(error);
      setIsExpanded(false);
    },
  });

  // Handle button click
  const handleClick = useCallback(async () => {
    if (isRecording) {
      stop();
    } else if (!isTranscribing) {
      setIsExpanded(true);
      await start();
    }
  }, [isRecording, isTranscribing, start, stop]);

  // Inline microphone icon variant
  if (variant === "inline") {
    return (
      <>
        <div className={cn("flex items-center", className)}>
          {isTranscribing && !isRecording ? (
            <TranscriptionLoader duration={duration} size={size} />
          ) : isRecording ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <RecordingIndicator
                  duration={duration}
                  audioLevel={audioLevel}
                  size={size}
                  color="blue"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={stop}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 h-7 px-2 text-xs"
                >
                  Stop
                </Button>
              </div>
              {liveTranscript && (
                <p className="text-xs text-muted-foreground leading-relaxed truncate max-w-[200px]">
                  {liveTranscript.slice(-80)}
                </p>
              )}
            </div>
          ) : (
            <MicrophoneButton
              size="icon"
              onClick={handleClick}
              disabled={disabled}
              className={className}
            />
          )}
        </div>

        {/* Troubleshooting Modal */}
        <VoiceTroubleshootingModal
          isOpen={showTroubleshooting}
          onClose={() => setShowTroubleshooting(false)}
          error={lastError?.message}
          errorCode={lastError?.code}
        />
      </>
    );
  }

  // Button variant with text
  return (
    <>
      <div className={cn("flex items-center", className)}>
        {isTranscribing && !isRecording ? (
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-4 sm:py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <TranscriptionLoader duration={duration} size={size} />
          </div>
        ) : isRecording || isExpanded ? (
          <div className="px-2 py-1 sm:px-4 sm:py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-1.5 sm:gap-3">
              <RecordingIndicator
                duration={duration}
                audioLevel={audioLevel}
                size={size}
                showPulse={isRecording}
                color="blue"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={stop}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 h-7 px-2 text-xs"
              >
                <span className="sm:hidden">Stop</span>
                <span className="hidden sm:inline">Stop Recording</span>
              </Button>
            </div>
            {liveTranscript && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-1 truncate">
                {liveTranscript.slice(-100)}
              </p>
            )}
          </div>
        ) : (
          <Button
            type="button"
            onClick={handleClick}
            disabled={disabled}
            className={cn(
              "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white",
              size === "sm" && "h-8 text-xs",
              size === "md" && "h-9 text-sm",
              size === "lg" && "h-10 text-base",
            )}
          >
            <AudioLines className="mr-2 h-4 w-4" />
            {buttonText}
          </Button>
        )}
      </div>

      {/* Troubleshooting Modal */}
      <VoiceTroubleshootingModal
        isOpen={showTroubleshooting}
        onClose={() => setShowTroubleshooting(false)}
        error={lastError?.message}
        errorCode={lastError?.code}
      />
    </>
  );
}
