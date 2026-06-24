"use client";

// features/audio/hooks/useMicField.ts
//
// THE reusable voice-to-text behavior for any text INPUT surface (ProTextarea,
// ProInput, prompt/agent/notes inputs…). It lifts the exact UX that ProTextarea
// pioneered — live transcript injection, append-vs-replace, "finalizing" state,
// error + troubleshooting, and unmount/close protection — onto the ONE shared
// recorder (`useVoiceCapture` → `GlobalRecordingProvider`).
//
// The surface keeps full control of its own layout: this hook owns the LOGIC
// and the modal/indicator STATE; the surface renders the mic button, device
// caret, live pill, troubleshooting modal, and protection dialog wherever its
// design wants them, reading everything from the returned object.
//
// Because it rides the shared session: only one field records at a time,
// start-always-wins (clicking record in another field takes over), and a
// recording survives route/tab changes.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useVoiceCapture,
  type UseVoiceCaptureResult,
} from "@/features/audio/hooks/useVoiceCapture";

export interface MicFieldError {
  message: string;
  code: string;
}

export interface UseMicFieldOptions {
  /** Stable id for this surface (defaults to a generated id). */
  instanceId?: string;
  /** Label for the global awareness indicator ("Recording — Agent message"). */
  label?: string;
  /** Read the field's current value (used as the base for append mode). */
  getValue: () => string;
  /** Write a new value back to the field (native input event, setState, …). */
  writeValue: (next: string) => void;
  /** Append to existing text vs replace. Default true (ProTextarea's default). */
  appendTranscript?: boolean;
  /**
   * How to join the pre-recording base text with the transcript in append
   * mode. Defaults to a newline join (ProTextarea). Single-line inputs pass a
   * space-joining variant.
   */
  join?: (base: string, text: string) => string;
  /** Warn before closing/unmounting while recording/transcribing. Default true. */
  protect?: boolean;
  /** Called when it's safe to close (user confirmed, or session finished). */
  onRequestClose?: () => void;
  /** Mirrors ProTextarea's `onTranscriptionComplete(text)`. */
  onTranscriptionComplete?: (text: string) => void;
  /** Mirrors ProTextarea's `onTranscriptionError(error)`. */
  onTranscriptionError?: (error: string) => void;
}

export interface UseMicFieldResult {
  /** This field is the active recorder. */
  isRecording: boolean;
  /** This field's just-stopped recording is finalizing (transcribing). */
  isTranscribing: boolean;
  /** Some OTHER (or this) surface holds the recorder right now. */
  isAnyRecording: boolean;
  /** 0–100 level for THIS field (0 when not the owner). */
  audioLevel: number;
  /** Live streaming transcript for THIS field. */
  liveTranscript: string;
  /** Recording is unavailable (no provider on this route). */
  available: boolean;
  /** Toggle record/stop for this field (captures the append base on start). */
  handleVoiceClick: () => Promise<void>;
  /** Ask to close — pops the protection dialog if a session is in flight. */
  requestClose: () => void;
  // Troubleshooting modal
  showTroubleshooting: boolean;
  setShowTroubleshooting: (open: boolean) => void;
  lastError: MicFieldError | null;
  // Unmount/close protection dialog
  showProtectionDialog: boolean;
  setShowProtectionDialog: (open: boolean) => void;
  /** Confirm the close from inside the protection dialog. */
  confirmClose: () => void;
  /** Dismiss the protection dialog (keep recording). */
  cancelClose: () => void;
  /** The underlying capture API, for surfaces that need pause/resume etc. */
  capture: UseVoiceCaptureResult;
}

export function useMicField(options: UseMicFieldOptions): UseMicFieldResult {
  const {
    getValue,
    writeValue,
    appendTranscript = true,
    join,
    protect = true,
    onRequestClose,
    onTranscriptionComplete,
    onTranscriptionError,
    label,
  } = options;

  const generatedId = useId();
  const instanceId = options.instanceId ?? generatedId;

  const preRecordingValueRef = useRef("");
  const closeRequestedRef = useRef(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [showProtectionDialog, setShowProtectionDialog] = useState(false);
  const [lastError, setLastError] = useState<MicFieldError | null>(null);

  // Keep the latest callbacks/options without re-creating capture callbacks.
  const cbRef = useRef({
    getValue,
    writeValue,
    appendTranscript,
    join,
    onTranscriptionComplete,
    onTranscriptionError,
  });
  cbRef.current = {
    getValue,
    writeValue,
    appendTranscript,
    join,
    onTranscriptionComplete,
    onTranscriptionError,
  };

  // Compose the field's new value from the captured base + transcript text,
  // honoring append mode and the surface's join strategy (newline default).
  const compose = (base: string, text: string): string => {
    if (!cbRef.current.appendTranscript || !base) return text;
    const joinFn = cbRef.current.join;
    return joinFn ? joinFn(base, text) : `${base}\n${text}`;
  };
  const composeRef = useRef(compose);
  composeRef.current = compose;

  const capture = useVoiceCapture({
    instanceId,
    label,
    onTranscript: (finalText) => {
      if (!finalText) return;
      cbRef.current.writeValue(
        composeRef.current(preRecordingValueRef.current, finalText),
      );
      cbRef.current.onTranscriptionComplete?.(finalText);
    },
    onError: (message, code) => {
      setLastError({ message, code: code || "UNKNOWN_ERROR" });
      toast.error("Voice input failed", {
        description: message,
        duration: 10000,
        action: {
          label: "Get Help",
          onClick: () => setShowTroubleshooting(true),
        },
      });
      cbRef.current.onTranscriptionError?.(message);
    },
  });

  const { isRecording, isTranscribing, liveTranscript } = capture;

  // Stream the live transcript into the field as chunks arrive (owner-gated:
  // `liveTranscript` is "" unless this field owns the recorder).
  useEffect(() => {
    if (!isRecording && !isTranscribing) return;
    if (!liveTranscript) return;
    cbRef.current.writeValue(
      composeRef.current(preRecordingValueRef.current, liveTranscript),
    );
  }, [liveTranscript, isRecording, isTranscribing]);

  const handleVoiceClick = useCallback(async () => {
    if (isRecording) {
      capture.stop();
    } else if (!isTranscribing) {
      // Snapshot the current text so append mode knows where to resume.
      preRecordingValueRef.current = cbRef.current.getValue();
      await capture.start();
    }
  }, [isRecording, isTranscribing, capture]);

  const requestClose = useCallback(() => {
    if (protect && (isRecording || isTranscribing)) {
      closeRequestedRef.current = true;
      setShowProtectionDialog(true);
    } else {
      onRequestClose?.();
    }
  }, [protect, isRecording, isTranscribing, onRequestClose]);

  // If the session ends on its own while the warning is up, clear the pending
  // close flag (the dialog flips to the safe "complete" state).
  useEffect(() => {
    if (
      !isRecording &&
      !isTranscribing &&
      closeRequestedRef.current &&
      showProtectionDialog
    ) {
      closeRequestedRef.current = false;
    }
  }, [isRecording, isTranscribing, showProtectionDialog]);

  const confirmClose = useCallback(() => {
    setShowProtectionDialog(false);
    closeRequestedRef.current = false;
    onRequestClose?.();
  }, [onRequestClose]);

  const cancelClose = useCallback(() => {
    setShowProtectionDialog(false);
    closeRequestedRef.current = false;
  }, []);

  return {
    isRecording,
    isTranscribing,
    isAnyRecording: capture.isAnyRecording,
    audioLevel: capture.audioLevel,
    liveTranscript,
    available: capture.available,
    handleVoiceClick,
    requestClose,
    showTroubleshooting,
    setShowTroubleshooting,
    lastError,
    showProtectionDialog,
    setShowProtectionDialog,
    confirmClose,
    cancelClose,
    capture,
  };
}
