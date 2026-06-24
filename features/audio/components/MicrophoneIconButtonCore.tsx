/**
 * MicrophoneIconButtonCore
 *
 * Full stateful implementation. Dynamically imported by MicrophoneIconButton —
 * never included in the initial JS bundle.
 *
 * Handles all three variants:
 *   icon-only      — fixed icon footprint, state communicated via icon + color + animation
 *   inline-expand  — expands to recording indicator + stop button while active
 *   modal-controls — fixed icon footprint; all recording interaction happens in a modal
 */

"use client";

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Mic } from "lucide-react";
import { useVoiceCapture } from "@/features/audio/hooks/useVoiceCapture";
import { cn } from "@/lib/utils";
import { RecordingIndicator } from "./RecordingIndicator";
import { TranscriptionLoader } from "./TranscriptionLoader";
import { VoiceTroubleshootingModal } from "./VoiceTroubleshootingModal";
import { MicrophoneRecordingModal } from "./MicrophoneRecordingModal";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type MicVariant = "icon-only" | "inline-expand" | "modal-controls";

export interface MicrophoneIconButtonCoreHandle {
  stopForTranscriptOnly: () => void;
}

export interface MicrophoneIconButtonCoreProps {
  id?: string;
  onTranscriptionComplete: (text: string) => void;
  onTranscriptOnlyComplete?: (text: string) => void;
  onLiveTranscript?: (text: string) => void;
  onRecordingStateChange?: (state: {
    isRecording: boolean;
    isTranscribing: boolean;
  }) => void;
  onError?: (error: string, code?: string) => void;
  variant?: MicVariant;
  /** When true the component starts recording as soon as it mounts. */
  autoStart?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}

// ── Size maps ───────────────────────────────────────────────────────────────
const buttonSizeMap = {
  xs: "h-6 w-6",
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-9 w-9",
} as const;
const iconSizeMap = {
  xs: "h-3.5 w-3.5",
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

// Default export required by React.lazy()
const MicrophoneIconButtonCore = forwardRef<
  MicrophoneIconButtonCoreHandle,
  MicrophoneIconButtonCoreProps
>(function MicrophoneIconButtonCore(
  {
    id,
    onTranscriptionComplete,
    onTranscriptOnlyComplete,
    onLiveTranscript,
    onRecordingStateChange,
    onError,
    variant = "icon-only",
    autoStart = false,
    size = "md",
    className,
    disabled = false,
  },
  ref,
) {
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [lastError, setLastError] = useState<{
    message: string;
    code: string;
  } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);

  // Guard against React StrictMode double-mount firing autoStart twice
  const autoStartFired = useRef(false);
  /** Routes the next stop completion to transcript-only vs full pipeline. */
  const stopModeRef = useRef<"full" | "transcript-only">("full");

  // ── Transcription success handler ────────────────────────────────────────
  const handleTranscriptionComplete = useCallback(
    (finalText: string) => {
      if (!finalText) return;

      if (variant === "modal-controls") {
        // APPEND each session's result so Add More doesn't overwrite
        setTranscribedText((prev) =>
          prev ? prev + " " + finalText : finalText,
        );
        return;
      }

      const mode = stopModeRef.current;
      stopModeRef.current = "full";
      if (mode === "transcript-only" && onTranscriptOnlyComplete) {
        onTranscriptOnlyComplete(finalText);
      } else {
        onTranscriptionComplete(finalText);
      }
    },
    [variant, onTranscriptionComplete, onTranscriptOnlyComplete],
  );

  // ── Error handler ────────────────────────────────────────────────────────
  const handleError = useCallback(
    (error: string, errorCode?: string) => {
      const code = errorCode ?? "UNKNOWN_ERROR";
      setLastError({ message: error, code });

      toast.error("Voice input failed", {
        description: error,
        duration: 10000,
        action: {
          label: "Get Help",
          onClick: () => setShowTroubleshooting(true),
        },
      });

      onError?.(error, code);

      if (variant === "modal-controls") {
        setModalOpen(false);
      }
    },
    [onError, variant],
  );

  // ── Shared session (start-always-wins, one-at-a-time, survives navigation,
  //    crash-safe). Previously this component span up its OWN chunked recorder,
  //    which is exactly how two mics could record at once. ───────────────────
  const {
    isRecording,
    isTranscribing,
    isPaused,
    durationSec: duration,
    audioLevel,
    liveTranscript,
    start: startRecording,
    stop: stopRecording,
    pause: pauseRecording,
    resume: resumeRecording,
  } = useVoiceCapture({
    instanceId: id,
    label: "Voice input",
    onTranscript: (finalText) => handleTranscriptionComplete(finalText),
    onError: handleError,
  });

  // Mirror the live streaming transcript out to the host (owner-gated, so a
  // recording on another surface never leaks into this one's callback).
  useEffect(() => {
    if (liveTranscript) onLiveTranscript?.(liveTranscript);
  }, [liveTranscript, onLiveTranscript]);

  useEffect(() => {
    onRecordingStateChange?.({ isRecording, isTranscribing });
  }, [isRecording, isTranscribing, onRecordingStateChange]);

  useImperativeHandle(
    ref,
    () => ({
      stopForTranscriptOnly: () => {
        if (!isRecording || disabled) return;
        stopModeRef.current = "transcript-only";
        stopRecording();
      },
    }),
    [disabled, isRecording, stopRecording],
  );

  // ── Auto-start on first mount ────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoStart || autoStartFired.current) return;
    autoStartFired.current = true;

    if (variant === "modal-controls") {
      setModalOpen(true);
    }
    startRecording();
  }, []);

  // ── Primary click handler (for idle icon button) ─────────────────────────
  const handleClick = useCallback(async () => {
    if (disabled) return;
    if (isTranscribing && !isRecording) return;

    if (variant === "modal-controls") {
      setModalOpen(true);
      if (!isRecording) await startRecording();
      return;
    }

    if (isRecording) {
      stopModeRef.current = "full";
      stopRecording();
    } else {
      await startRecording();
    }
  }, [
    disabled,
    isTranscribing,
    variant,
    isRecording,
    startRecording,
    stopRecording,
  ]);

  // ── Modal: keep liveTranscript synced — APPEND to edited text ─────────────
  // liveTranscript is passed to modal as a live preview only (not accumulated here).
  // Text accumulation happens through onTranscriptionComplete (fires once per session).
  // This avoids double-counting between incremental chunks and the final callback.

  // ── Modal handlers ───────────────────────────────────────────────────────
  const handleModalCancel = useCallback(() => {
    if (isRecording) stopRecording();
    setTranscribedText(null);
    setModalOpen(false);
  }, [isRecording, stopRecording]);

  const handleModalAccept = useCallback(
    (text: string) => {
      onTranscriptionComplete(text);
      setTranscribedText(null);
      setModalOpen(false);
    },
    [onTranscriptionComplete],
  );

  const handleModalRetry = useCallback(async () => {
    setTranscribedText(null);
    // start() clears the shared session's live transcript and begins fresh.
    await startRecording();
  }, [startRecording]);

  // Add more: keeps accumulated text, starts a fresh recording pass that appends
  // (start() clears liveTranscript on the shared session; transcribedText stays
  // in local state).
  const handleModalAddMore = useCallback(async () => {
    await startRecording();
  }, [startRecording]);

  // ── Shared base button classes ───────────────────────────────────────────
  const baseBtn = cn(
    "inline-flex items-center justify-center rounded-full",
    "transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    buttonSizeMap[size],
    disabled && "opacity-50 cursor-not-allowed",
  );

  // ══════════════════════════════════════════════════════════════════════════
  // VARIANT: icon-only
  // 3-layer design:
  //   outer  — 48 × 48 transparent tap target, invisible
  //   middle — glass pill (backdrop blur + glass border)
  //   inner  — mic icon / spinner
  // Audio-reactive rings are rendered outside the glass layer so they can
  // breathe past the glass edge without being clipped.
  // ══════════════════════════════════════════════════════════════════════════
  if (variant === "icon-only") {
    const isActive = isRecording || isTranscribing;

    return (
      <>
        <button
          id={id}
          type="button"
          onClick={handleClick}
          disabled={disabled || (isTranscribing && !isRecording)}
          title={
            isRecording
              ? "Tap to stop recording"
              : isTranscribing
                ? "Processing…"
                : "Start recording"
          }
          className={cn(
            "relative inline-flex items-center justify-center rounded-full",
            buttonSizeMap[size],
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            disabled && "cursor-not-allowed opacity-50",
            isActive && "cursor-pointer",
            !isActive && !disabled && "cursor-pointer",
            className,
          )}
        >
          {isRecording && (
            <span
              className="absolute inset-0 rounded-full bg-primary/15 transition-transform duration-75"
              style={{ transform: `scale(${1 + (audioLevel ?? 0) / 110})` }}
            />
          )}
          {isRecording && (
            <span
              className="absolute inset-0 rounded-full bg-primary/20 animate-ping"
              style={{ animationDuration: "1.5s" }}
            />
          )}

          <span
            className={cn(
              "relative z-10 inline-flex items-center justify-center rounded-full",
              "h-full w-full transition-all duration-200",
              isActive
                ? "bg-primary/15 dark:bg-primary/10 backdrop-blur-md shadow-md hover:bg-primary/25"
                : "bg-white/10 dark:bg-white/5 backdrop-blur-md shadow-sm hover:bg-accent",
              "hover:scale-105 active:scale-95",
            )}
          >
            <Mic
              className={cn(
                "h-3.5 w-3.5",
                isActive ? "text-primary" : "text-foreground/70",
              )}
            />
          </span>
        </button>

        <VoiceTroubleshootingModal
          isOpen={showTroubleshooting}
          onClose={() => setShowTroubleshooting(false)}
          error={lastError?.message}
          errorCode={lastError?.code}
        />
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VARIANT: inline-expand
  // Expands to show recording indicator + stop button while active.
  // ══════════════════════════════════════════════════════════════════════════
  if (variant === "inline-expand") {
    if (isTranscribing && !isRecording) {
      return (
        <>
          <TranscriptionLoader duration={duration} size={size as any} />
          <VoiceTroubleshootingModal
            isOpen={showTroubleshooting}
            onClose={() => setShowTroubleshooting(false)}
            error={lastError?.message}
            errorCode={lastError?.code}
          />
        </>
      );
    }

    if (isRecording) {
      return (
        <>
          <div className={cn("flex flex-col gap-1", className)}>
            <div className="flex items-center gap-1.5">
              <RecordingIndicator
                duration={duration}
                audioLevel={audioLevel}
                size={size as any}
                color="blue"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  stopModeRef.current = "full";
                  stopRecording();
                }}
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
          <VoiceTroubleshootingModal
            isOpen={showTroubleshooting}
            onClose={() => setShowTroubleshooting(false)}
            error={lastError?.message}
            errorCode={lastError?.code}
          />
        </>
      );
    }

    // Idle
    return (
      <>
        <button
          id={id}
          type="button"
          onClick={handleClick}
          disabled={disabled}
          title="Start recording"
          className={cn(
            baseBtn,
            "hover:bg-accent text-muted-foreground",
            className,
          )}
        >
          <Mic className={iconSizeMap[size]} />
        </button>
        <VoiceTroubleshootingModal
          isOpen={showTroubleshooting}
          onClose={() => setShowTroubleshooting(false)}
          error={lastError?.message}
          errorCode={lastError?.code}
        />
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VARIANT: modal-controls
  // Fixed footprint. All interaction happens inside the modal.
  // ══════════════════════════════════════════════════════════════════════════
  const modalActive = isRecording || isTranscribing;

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title="Open voice recorder"
        className={cn(
          baseBtn,
          "relative overflow-visible",
          modalActive && "text-primary",
          !modalActive && "hover:bg-accent text-muted-foreground",
          className,
        )}
      >
        {isRecording && (
          <span
            className="absolute inset-0 rounded-full bg-primary/20 transition-transform duration-75"
            style={{ transform: `scale(${1 + (audioLevel ?? 0) / 120})` }}
          />
        )}
        {isRecording && (
          <span
            className="absolute inset-0 rounded-full bg-primary/25 animate-ping"
            style={{ animationDuration: "1.5s" }}
          />
        )}
        <Mic
          className={cn(
            iconSizeMap[size],
            "relative",
            modalActive ? "text-primary" : "",
          )}
        />
      </button>

      <MicrophoneRecordingModal
        isOpen={modalOpen}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        isPaused={isPaused}
        duration={duration}
        audioLevel={audioLevel}
        transcribedText={transcribedText}
        livePreview={liveTranscript || null}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onPauseRecording={pauseRecording}
        onResumeRecording={resumeRecording}
        onAccept={handleModalAccept}
        onRetry={handleModalRetry}
        onAddMore={handleModalAddMore}
        onCancel={handleModalCancel}
      />

      <VoiceTroubleshootingModal
        isOpen={showTroubleshooting}
        onClose={() => setShowTroubleshooting(false)}
        error={lastError?.message}
        errorCode={lastError?.code}
      />
    </>
  );
});

export default MicrophoneIconButtonCore;
