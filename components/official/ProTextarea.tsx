/**
 * ProTextarea — the canonical full-feature textarea for user-authored content.
 *
 * The Tier 2 default for any textarea that holds user text (comments,
 * descriptions, notes, bios, prompts, status updates, replies). Tier 1 is the
 * bare shadcn `Textarea` from `@/components/ui/textarea`, used only for raw
 * cases (admin diff inputs, debug consoles, etc.).
 *
 * ## Built-in features
 *
 * - **Voice input** — mic toggle with live streaming transcription, audio-level
 *   glow, and a recording-protection modal that warns before unmount while a
 *   recording or transcription is in flight.
 * - **Copy-to-clipboard** — top-right copy button with success-state animation.
 * - **Submit button** — opt-in via `onSubmit`. Renders a primary-colored Send
 *   button at bottom-right. `Cmd/Ctrl + Enter` triggers it. `submitOnEnter`
 *   makes plain Enter submit (Shift+Enter still inserts newline).
 * - **Auto-grow** — `autoGrow` resizes the textarea to fit content within
 *   `minHeight` / `maxHeight` bounds. Once content reaches `maxHeight` the
 *   textarea becomes internally scrollable (it does not clip). Always pass a
 *   `maxHeight` with `autoGrow` so the field can't grow past the viewport.
 * - **Floating label** — pass `floatingLabel="…"` for a dense-form label that
 *   animates inside the border. See "Labelling" below.
 *
 * ## Labelling
 *
 * - **Above-label** (default for spacious forms) — wrap with `<Field>`:
 *   ```tsx
 *   <Field label="Title" htmlFor="title" required>
 *     <ProTextarea id="title" value={…} onChange={…} />
 *   </Field>
 *   ```
 * - **Floating label** (dense forms) — pass `floatingLabel`:
 *   ```tsx
 *   <ProTextarea floatingLabel="Notes" value={…} onChange={…} />
 *   ```
 *   Use only inside a `bg-card` surface — the label background masks the
 *   border with `bg-card`. For non-card surfaces, use `<Field>` instead.
 * - **No label** (search, comments, filters) — bare `<ProTextarea>` with
 *   `placeholder`.
 *
 * ## Constraints (intentional)
 *
 * - `floatingLabel` and `placeholder` are mutually exclusive. The floating
 *   label sits where the placeholder would, so the placeholder is suppressed
 *   when `floatingLabel` is set.
 * - Don't try to override the icon positions or recording-state styles via
 *   `className`. The icon layout is fixed.
 * - For schema-bound textareas (Entity, Settings, Applet), build a thin
 *   wrapper that owns the binding logic and renders ProTextarea — don't
 *   re-implement voice/copy/submit per system.
 *
 * Renamed from `VoiceTextarea`. A re-export shim still lives at
 * `components/official/VoiceTextarea.tsx` for backwards compatibility.
 *
 * @official-component
 */

"use client";

import React, { useCallback, useState, useRef, useEffect, useId } from "react";
import { Copy, Check, Mic, Loader2, Send } from "lucide-react";
import { motion } from "motion/react";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  TapTargetButton,
  TapTargetButtonSolid,
} from "@/components/icons/TapTargetButton";
import { TranscriptionResult } from "@/features/audio/types";
import { VoiceTroubleshootingModal } from "@/features/audio/components/VoiceTroubleshootingModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

/** Real HTMLTextAreaElement with optional expando methods set by ProTextarea. */
export interface ProTextareaElement extends HTMLTextAreaElement {
  requestClose?: () => void;
  isTranscribing?: () => boolean;
}

export interface ProTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onTranscriptionComplete?: (text: string) => void;
  onTranscriptionError?: (error: string) => void;
  /** If true, appends to existing text; if false, replaces. Default: true. */
  appendTranscript?: boolean;
  autoGrow?: boolean;
  minHeight?: number;
  maxHeight?: number;
  wrapperClassName?: string;
  /** Called when it's safe to close/unmount (after user confirms or recording/transcription completes). */
  onRequestClose?: () => void;
  /** If true, prevents unmounting during recording/transcription with a warning modal. Default: true. */
  protectTranscription?: boolean;
  /** Show the copy-to-clipboard button at the top-right. Default: true. */
  showCopyButton?: boolean;
  /** When provided, renders a prominent submit button at the bottom-right. */
  onSubmit?: () => void;
  /** Force-disable the submit button regardless of content. */
  submitDisabled?: boolean;
  /** Show a spinner inside the submit button. */
  isSubmitting?: boolean;
  /** Accessible/tooltip label for the submit button. Default: "Send". */
  submitLabel?: string;
  /** Submit on Cmd/Ctrl + Enter. Defaults to true when `onSubmit` is provided. */
  submitOnCmdEnter?: boolean;
  /** Submit on plain Enter (Shift+Enter still inserts newline). Default: false. */
  submitOnEnter?: boolean;
  /**
   * Floating label text (dense-form variant). When set, the label animates
   * into the border on focus or value, and the `placeholder` prop is
   * suppressed (they would visually conflict). Use only in a `bg-card`
   * surface — the label uses `bg-card` to mask the input border. For
   * non-card surfaces, use `<Field>` with the above-label style instead.
   */
  floatingLabel?: string;
}

export const ProTextarea = React.forwardRef<
  HTMLTextAreaElement,
  ProTextareaProps
>(
  (
    {
      className,
      wrapperClassName,
      onTranscriptionComplete,
      onTranscriptionError,
      appendTranscript = true,
      autoGrow = false,
      minHeight,
      maxHeight,
      value,
      onChange,
      onKeyDown,
      disabled,
      onRequestClose,
      protectTranscription = true,
      showCopyButton = true,
      onSubmit,
      submitDisabled,
      isSubmitting = false,
      submitLabel = "Send",
      submitOnCmdEnter,
      submitOnEnter = false,
      floatingLabel,
      id: idProp,
      placeholder,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = idProp ?? (floatingLabel ? generatedId : undefined);
    const [hasCopied, setHasCopied] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isAudioAvailable, setIsAudioAvailable] = useState(true);
    const [showTroubleshooting, setShowTroubleshooting] = useState(false);
    const [showTranscriptionWarning, setShowTranscriptionWarning] =
      useState(false);
    const [lastError, setLastError] = useState<{
      message: string;
      code: string;
    } | null>(null);
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef =
      (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
    const closeRequestedRef = useRef(false);
    const preRecordingValueRef = useRef("");

    // Check if audio is available
    useEffect(() => {
      const checkAudioAvailability = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setIsAudioAvailable(false);
            return;
          }
          // Just check if we can enumerate devices, don't actually request permission yet
          await navigator.mediaDevices.enumerateDevices();
          setIsAudioAvailable(true);
        } catch (error) {
          console.warn("Audio not available:", error);
          setIsAudioAvailable(false);
        }
      };
      checkAudioAvailability();
    }, []);

    // Auto-grow functionality
    useEffect(() => {
      if (!autoGrow || !textareaRef.current) return;

      const textarea = textareaRef.current;
      textarea.style.height = "auto";

      let newHeight = textarea.scrollHeight;
      if (minHeight) newHeight = Math.max(newHeight, minHeight);
      if (maxHeight) newHeight = Math.min(newHeight, maxHeight);

      textarea.style.height = `${newHeight}px`;
    }, [value, autoGrow, minHeight, maxHeight]);

    const pushToTextarea = useCallback((newValue: string) => {
      if (!textareaRef.current) return;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(textareaRef.current, newValue);
        const event = new Event("input", { bubbles: true });
        textareaRef.current.dispatchEvent(event);
      }
    }, []);

    const handleTranscriptionComplete = useCallback(
      (result: TranscriptionResult) => {
        if (result.success && result.text) {
          const base = preRecordingValueRef.current;
          const newValue =
            appendTranscript && base ? `${base}\n${result.text}` : result.text;
          pushToTextarea(newValue);
          onTranscriptionComplete?.(result.text);
        }
      },
      [appendTranscript, onTranscriptionComplete, pushToTextarea],
    );

    const handleTranscriptionError = useCallback(
      (error: string, errorCode?: string) => {
        console.error("Transcription error:", error, errorCode);

        setLastError({ message: error, code: errorCode || "UNKNOWN_ERROR" });

        toast.error("Voice input failed", {
          description: error,
          duration: 10000,
          action: {
            label: "Get Help",
            onClick: () => setShowTroubleshooting(true),
          },
        });

        onTranscriptionError?.(error);
      },
      [onTranscriptionError],
    );

    // Recording and transcription hook (streaming: real-time text while speaking)
    const {
      isRecording,
      isTranscribing,
      audioLevel,
      liveTranscript,
      startRecording,
      stopRecording,
    } = useRecordAndTranscribe({
      onTranscriptionComplete: handleTranscriptionComplete,
      onError: handleTranscriptionError,
      autoTranscribe: true,
      streaming: true,
    });

    // Stream liveTranscript into the textarea as chunks arrive
    useEffect(() => {
      if (!isRecording && !isTranscribing) return;
      if (!liveTranscript) return;
      const base = preRecordingValueRef.current;
      const newValue =
        appendTranscript && base
          ? `${base}\n${liveTranscript}`
          : liveTranscript;
      pushToTextarea(newValue);
    }, [
      liveTranscript,
      isRecording,
      isTranscribing,
      appendTranscript,
      pushToTextarea,
    ]);

    const handleCloseRequest = useCallback(() => {
      if (protectTranscription && (isRecording || isTranscribing)) {
        closeRequestedRef.current = true;
        setShowTranscriptionWarning(true);
      } else {
        onRequestClose?.();
      }
    }, [isRecording, isTranscribing, protectTranscription, onRequestClose]);

    // Attach custom methods as expando properties on the real DOM element so
    // consumers get a genuine HTMLTextAreaElement (focus/blur/select all work)
    // while still being able to call requestClose() and isTranscribing().
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      (el as ProTextareaElement).requestClose = handleCloseRequest;
      (el as ProTextareaElement).isTranscribing = () => isTranscribing;
    }, [handleCloseRequest, isTranscribing]);

    useEffect(() => {
      if (
        !isRecording &&
        !isTranscribing &&
        closeRequestedRef.current &&
        showTranscriptionWarning
      ) {
        closeRequestedRef.current = false;
      }
    }, [isRecording, isTranscribing, showTranscriptionWarning]);

    const handleCopy = async () => {
      const textareaValue = textareaRef?.current?.value || String(value || "");
      if (textareaValue) {
        await navigator.clipboard.writeText(textareaValue);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 450);
      }
    };

    const handleVoiceClick = useCallback(async () => {
      if (isRecording) {
        stopRecording();
      } else if (!isTranscribing) {
        preRecordingValueRef.current = textareaRef.current?.value || "";
        await startRecording();
      }
    }, [isRecording, isTranscribing, startRecording, stopRecording]);

    const valueAsString = String(value ?? "");
    const hasContent = valueAsString.trim().length > 0;
    const canSubmit =
      !!onSubmit && hasContent && !submitDisabled && !isSubmitting && !disabled;
    const cmdEnterEnabled = submitOnCmdEnter ?? !!onSubmit;

    const triggerSubmit = useCallback(() => {
      if (canSubmit && onSubmit) onSubmit();
    }, [canSubmit, onSubmit]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Mirror the browser's "hide cursor while typing" behavior: any
        // keypress hides the hover controls until the mouse moves again.
        // Without this, the icons remain visible even though the OS cursor
        // has vanished, which feels noisy mid-thought.
        if (isHovered) setIsHovered(false);

        onKeyDown?.(e);
        if (e.defaultPrevented || !onSubmit || e.key !== "Enter") return;

        if (cmdEnterEnabled && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          triggerSubmit();
          return;
        }

        if (submitOnEnter && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          triggerSubmit();
        }
      },
      [
        isHovered,
        onKeyDown,
        onSubmit,
        cmdEnterEnabled,
        submitOnEnter,
        triggerSubmit,
      ],
    );

    // Icons appear ONLY on active mouse presence (or when recording/
    // transcribing, so the user can see/stop an in-flight session). Focus
    // does NOT reveal the controls. `isHovered` is cleared on keydown and
    // re-armed on mousemove — matching how the OS cursor auto-hides while
    // typing and reappears on motion. Wrapper has static padding (driven by
    // `showTopRightControls`/`onSubmit` props that don't change on hover),
    // so no layout shift can occur here.
    const showControls =
      (isHovered || isRecording || isTranscribing) && !disabled;
    const isVoiceDisabled =
      !isAudioAvailable || disabled || (isTranscribing && !isRecording);
    const showTopRightControls = isAudioAvailable || showCopyButton;

    const isInvalid =
      props["aria-invalid"] === true || props["aria-invalid"] === "true";
    const labelFloated = isFocused || valueAsString.length > 0;

    return (
      <div
        className={cn("relative group", wrapperClassName)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseMove={() => {
          // Re-arm controls on motion. React bails on identity-equal state,
          // so this is effectively free when already hovered.
          if (!isHovered) setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
      >
        <textarea
          ref={textareaRef}
          id={inputId}
          placeholder={floatingLabel ? undefined : placeholder}
          className={cn(
            "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm resize-y placeholder:text-neutral-500 dark:placeholder:text-neutral-400",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            // Auto-grow disables the manual resize handle. Use overflow-y-auto
            // (not overflow-hidden) so that once content hits `maxHeight` the
            // textarea becomes internally scrollable instead of clipping text
            // the user can never reach. While growing (height === scrollHeight)
            // no scrollbar shows; it only appears once capped at maxHeight.
            autoGrow && "resize-none overflow-y-auto",
            // Static right-padding to clear two TapTargetButtons (44px each
            // = 88px total) at the top-right.
            showTopRightControls ? "pr-24" : "pr-3",
            // Bottom padding for the submit button — TapTargetButtonSolid is
            // 44px tall (h-11), so reserve enough vertical clearance.
            onSubmit && "pb-14",
            className,
          )}
          style={{
            minHeight: minHeight ? `${minHeight}px` : undefined,
            maxHeight: maxHeight ? `${maxHeight}px` : undefined,
          }}
          value={value}
          onChange={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          {...props}
        />

        {floatingLabel && inputId && (
          <Label
            htmlFor={inputId}
            className={cn(
              "absolute left-3 px-1 pointer-events-none transition-all duration-200 ease-in-out z-10 bg-card",
              labelFloated ? "-top-2 text-xs" : "top-3 text-sm",
              isInvalid
                ? "text-destructive"
                : isFocused
                  ? "text-primary"
                  : "text-muted-foreground",
              disabled && "opacity-50",
            )}
          >
            {floatingLabel}
          </Label>
        )}

        {/* Top-right control cluster (mic + copy) — fades in on focus/hover.
            Two individual TapTargetButtons (44×44 outer, 32×32 visible pill).
            No gap or padding on the wrapper: the buttons own their own spacing. */}
        <div
          className={cn(
            "absolute right-0 top-0 flex items-center transition-opacity duration-200 z-10",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          {isAudioAvailable && (
            <div className="relative">
              {/* Recording pulse + audio-level glow, sized to match the visible
                  pill (h-8 w-8) and centered inside the 44×44 tap area via
                  `inset-0 m-auto`. Pointer-events-none so they never steal
                  clicks from the TapTargetButton above. */}
              {isRecording && (
                <>
                  <span
                    className="pointer-events-none absolute inset-0 m-auto h-8 w-8 rounded-full bg-primary/20 animate-ping"
                    style={{ animationDuration: "1.5s" }}
                  />
                  <span
                    className="pointer-events-none absolute inset-0 m-auto h-8 w-8 rounded-full bg-primary/15"
                    style={{
                      transform: `scale(${1 + audioLevel / 200})`,
                      transition: "transform 75ms",
                    }}
                  />
                </>
              )}
              <TapTargetButton
                onClick={handleVoiceClick}
                disabled={isVoiceDisabled}
                ariaLabel={isRecording ? "Stop recording" : "Start voice input"}
                tooltip={isRecording ? "Stop recording" : "Voice input"}
                className={cn(
                  isRecording
                    ? "text-primary"
                    : isTranscribing
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-muted-foreground",
                )}
                icon={
                  isTranscribing && !isRecording ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )
                }
              />
            </div>
          )}

          {showCopyButton && (
            <TapTargetButton
              onClick={handleCopy}
              ariaLabel="Copy to clipboard"
              tooltip={hasCopied ? "Copied" : "Copy"}
              className={hasCopied ? "text-green-500" : "text-muted-foreground"}
              icon={
                hasCopied ? (
                  <motion.span
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="inline-flex"
                  >
                    <Check className="h-4 w-4" />
                  </motion.span>
                ) : (
                  <Copy className="h-4 w-4" />
                )
              }
            />
          )}
        </div>

        {/* Submit Button (bottom-right) — solid TapTarget with primary color. */}
        {onSubmit && (
          <div className="absolute right-0 bottom-0 z-10">
            <TapTargetButtonSolid
              onClick={triggerSubmit}
              disabled={!canSubmit}
              ariaLabel={submitLabel}
              tooltip={submitLabel}
              icon={
                isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )
              }
            />
          </div>
        )}

        {isRecording && (
          <div
            className={cn(
              "absolute left-2 bottom-2 flex items-center gap-1.5 px-2 py-1 bg-primary/10 dark:bg-primary/15 rounded-md",
              // Clear the submit button when present (TapTargetButtonSolid is
              // 44px wide). When there is no submit, just keep a small inset.
              onSubmit ? "right-14" : "right-2",
            )}
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="w-2 h-2 bg-primary rounded-full flex-shrink-0"
            />
            <span className="text-xs text-primary font-medium truncate">
              {liveTranscript ? liveTranscript.slice(-60) : "Listening..."}
            </span>
          </div>
        )}

        {/* Transcribing Indicator (finalizing after recording stops) */}
        {isTranscribing && !isRecording && (
          <div className="absolute left-2 bottom-2 flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-md">
            <Loader2 className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              Finalizing...
            </span>
          </div>
        )}

        <VoiceTroubleshootingModal
          isOpen={showTroubleshooting}
          onClose={() => setShowTroubleshooting(false)}
          error={lastError?.message}
          errorCode={lastError?.code}
        />

        {/* Voice Input Protection Modal - Built-in protection for recording and transcription */}
        <AlertDialog
          open={showTranscriptionWarning}
          onOpenChange={setShowTranscriptionWarning}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                {isRecording || isTranscribing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    <AlertDialogTitle>
                      {isRecording
                        ? "Recording in Progress"
                        : "Transcription in Progress"}
                    </AlertDialogTitle>
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 text-green-500" />
                    <AlertDialogTitle>Voice Input Complete</AlertDialogTitle>
                  </>
                )}
              </div>
              <AlertDialogDescription>
                {isRecording ? (
                  <>
                    Your voice is currently being recorded. If you close now,
                    the recording will be stopped and lost.
                  </>
                ) : isTranscribing ? (
                  <>
                    Your voice recording is currently being transcribed. If you
                    close now, the transcription will be lost.
                  </>
                ) : (
                  <>
                    Your voice input has been processed successfully! You can
                    now safely close this panel.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {isRecording || isTranscribing ? (
                <>
                  <AlertDialogCancel
                    onClick={() => {
                      setShowTranscriptionWarning(false);
                      closeRequestedRef.current = false;
                    }}
                  >
                    Cancel & Wait
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setShowTranscriptionWarning(false);
                      closeRequestedRef.current = false;
                      onRequestClose?.();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isRecording ? "Stop Recording" : "End Transcription"}
                  </AlertDialogAction>
                </>
              ) : (
                <AlertDialogAction
                  onClick={() => {
                    setShowTranscriptionWarning(false);
                    closeRequestedRef.current = false;
                    onRequestClose?.();
                  }}
                >
                  Close
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);

ProTextarea.displayName = "ProTextarea";
