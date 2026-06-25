/**
 * ProInput — the canonical full-feature single-line input for user-authored content.
 *
 * The Tier 2 default for any input that holds user text (titles, names, search
 * queries, chat prompts, tags, short replies). Tier 1 is the bare shadcn
 * `BasicInput` from `@/components/ui/input`, used only for raw cases (admin
 * diff inputs, debug consoles, etc.).
 *
 * ## Built-in features
 *
 * - **Voice input** — mic toggle with live streaming transcription, audio-level
 *   glow, and a recording-protection modal that warns before unmount while a
 *   recording or transcription is in flight.
 * - **"…" actions menu** — a hover-revealed right-side menu hosting Copy (and
 *   the natural home for future actions). It floats over the text (no reserved
 *   right gutter) and only appears while the mouse is over the field — never
 *   from focus alone — so it stays out of the way while typing.
 * - **Submit button** — opt-in via `onSubmit`. Renders a transparent Send
 *   tap button at the right edge. `Cmd/Ctrl + Enter` triggers it. `submitOnEnter`
 *   makes plain Enter submit.
 * - **Field navigation** — opt-in via `onEnterKey`. Plain Enter advances to the
 *   next field instead of submitting (for sequential form flows).
 * - **Clear button** — opt-in via `clearable` (+ optional `onClear`).
 * - **Start icon** — opt-in via `startIcon` for search/filter prefixes.
 * - **iOS zoom guard** — value text is always 16px (built in); placeholder
 *   stays `text-sm` so empty fields don't look oversized.
 * - **Floating label** — pass `floatingLabel="…"` for a dense-form label that
 *   animates inside the border. See "Labelling" below.
 *
 * ## Labelling
 *
 * - **Above-label** (default for spacious forms) — wrap with `<Field>`:
 *   ```tsx
 *   <Field label="Title" htmlFor="title" required>
 *     <ProInput id="title" value={…} onChange={…} />
 *   </Field>
 *   ```
 * - **Floating label** (dense forms) — pass `floatingLabel`:
 *   ```tsx
 *   <ProInput floatingLabel="Search" value={…} onChange={…} />
 *   ```
 *   Use only inside a `bg-card` surface — the label background masks the
 *   border with `bg-card`. For non-card surfaces, use `<Field>` instead.
 * - **No label** (search, filters, quick-add bars) — bare `<ProInput>` with
 *   `placeholder`.
 *
 * ## Constraints (intentional)
 *
 * - `floatingLabel` and `placeholder` are mutually exclusive. The floating
 *   label sits where the placeholder would, so the placeholder is suppressed
 *   when `floatingLabel` is set.
 * - Don't try to override the icon positions or recording-state styles via
 *   `className`. The icon layout is fixed. Controls use prebuilt transparent
 *   tap buttons (`MicTapButton`, `CopyTapButton`, `SendTapButton`, etc.)
 *   so they sit flush inside the field without glass borders touching the edge.
 * - For schema-bound inputs (Entity, Settings, Applet), build a thin
 *   wrapper that owns the binding logic and renders ProInput — don't
 *   re-implement voice/copy/submit per system.
 *
 * Renamed from `VoiceInput`. A re-export shim still lives at
 * `components/official/VoiceInput.tsx` for backwards compatibility.
 *
 * @official-component
 */

"use client";

import React, { useCallback, useState, useRef, useEffect, useId } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useMicField } from "@/features/audio/hooks/useMicField";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  CheckTapButton,
  LoadingTapButton,
  MicOffTapButton,
  MicTapButton,
  MoreHorizontalTapButton,
  SendTapButton,
  XTapButton,
} from "@/components/icons/tap-buttons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MicDeviceMenu } from "@/components/audio/MicDeviceMenu";
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

/** Real HTMLInputElement with optional expando methods set by ProInput. */
export interface ProInputElement extends HTMLInputElement {
  requestClose?: () => void;
  isTranscribing?: () => boolean;
}

export interface ProInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onTranscriptionComplete?: (text: string) => void;
  onTranscriptionError?: (error: string) => void;
  /** If true, appends to existing text; if false, replaces. Default: true. */
  appendTranscript?: boolean;
  wrapperClassName?: string;
  /** Called when it's safe to close/unmount (after user confirms or recording/transcription completes). */
  onRequestClose?: () => void;
  /** If true, prevents unmounting during recording/transcription with a warning modal. Default: true. */
  protectTranscription?: boolean;
  /** Show the Copy action inside the "…" menu. Default: true. */
  showCopyButton?: boolean;
  /** When provided, renders a prominent submit button at the right edge. */
  onSubmit?: () => void;
  /** Force-disable the submit button regardless of content. */
  submitDisabled?: boolean;
  /** Show a spinner inside the submit button. */
  isSubmitting?: boolean;
  /** Accessible/tooltip label for the submit button. Default: "Send". */
  submitLabel?: string;
  /** Submit on Cmd/Ctrl + Enter. Defaults to true when `onSubmit` is provided. */
  submitOnCmdEnter?: boolean;
  /** Submit on plain Enter. Default: false. */
  submitOnEnter?: boolean;
  /**
   * Field-navigation mode (opt-in). When provided, plain Enter calls
   * `onEnterKey` (the caller typically advances focus to the next field)
   * instead of submitting. Takes precedence over `onSubmit` / `submitOnEnter`
   * for the Enter key, so the two are not meant to be combined.
   */
  onEnterKey?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Optional leading icon/node — auto-applies left padding. */
  startIcon?: React.ReactNode;
  /** When true, shows a clear (×) control while the field has content. */
  clearable?: boolean;
  /** Called when the clear control is pressed. Defaults to clearing via `onChange`. */
  onClear?: () => void;
  /**
   * Floating label text (dense-form variant). When set, the label animates
   * into the border on focus or value, and the `placeholder` prop is
   * suppressed (they would visually conflict). Use only in a `bg-card`
   * surface — the label uses `bg-card` to mask the input border. For
   * non-card surfaces, use `<Field>` with the above-label style instead.
   */
  floatingLabel?: string;
}

// Reserve right padding ONLY for the persistent controls (clear + submit).
// The hover-only controls (mic + "…" menu) float over the text with no
// reserved gutter — they're hidden while typing, so they never sit on top of
// text the user is actively editing.
function rightPaddingClass(hasSubmit: boolean, showClear: boolean): string {
  const count = (hasSubmit ? 1 : 0) + (showClear ? 1 : 0);
  if (count === 2) return "pr-24";
  if (count === 1) return "pr-11";
  return "pr-3";
}

/** iOS zoom guard — value text only; placeholder stays text-sm. */
const INPUT_IOS_STYLE: React.CSSProperties = { fontSize: "16px" };

export const ProInput = React.forwardRef<HTMLInputElement, ProInputProps>(
  (
    {
      className,
      wrapperClassName,
      onTranscriptionComplete,
      onTranscriptionError,
      appendTranscript = true,
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
      onEnterKey,
      startIcon,
      clearable = false,
      onClear,
      floatingLabel,
      id: idProp,
      placeholder,
      type = "text",
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = idProp ?? (floatingLabel ? generatedId : undefined);
    const [hasCopied, setHasCopied] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isAudioAvailable, setIsAudioAvailable] = useState(true);
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;

    useEffect(() => {
      const checkAudioAvailability = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setIsAudioAvailable(false);
            return;
          }
          await navigator.mediaDevices.enumerateDevices();
          setIsAudioAvailable(true);
        } catch (error) {
          console.warn("Audio not available:", error);
          setIsAudioAvailable(false);
        }
      };
      checkAudioAvailability();
    }, []);

    const pushToInput = useCallback((newValue: string) => {
      if (!inputRef.current) return;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputRef.current, newValue);
        const event = new Event("input", { bubbles: true });
        inputRef.current.dispatchEvent(event);
      }
    }, []);

    // Voice-to-text rides the ONE shared recorder via the reusable
    // `useMicField` primitive (start-always-wins, one-at-a-time, survives
    // navigation, crash-safe). Single-line input joins with a space.
    // Destructured into the original local names so the JSX below is unchanged.
    const {
      isRecording,
      isTranscribing,
      audioLevel,
      liveTranscript,
      handleVoiceClick,
      requestClose: handleCloseRequest,
      showTroubleshooting,
      setShowTroubleshooting,
      showProtectionDialog: showTranscriptionWarning,
      setShowProtectionDialog: setShowTranscriptionWarning,
      lastError,
      confirmClose,
      cancelClose,
    } = useMicField({
      instanceId: inputId,
      getValue: () => inputRef.current?.value ?? String(value ?? ""),
      writeValue: pushToInput,
      appendTranscript,
      join: (base, text) => `${base}${base.endsWith(" ") ? "" : " "}${text}`,
      protect: protectTranscription,
      onRequestClose,
      onTranscriptionComplete,
      onTranscriptionError,
    });

    useEffect(() => {
      const el = inputRef.current;
      if (!el) return;
      (el as ProInputElement).requestClose = handleCloseRequest;
      (el as ProInputElement).isTranscribing = () => isTranscribing;
    }, [handleCloseRequest, isTranscribing]);

    const handleCopy = async () => {
      const inputValue = inputRef?.current?.value || String(value || "");
      if (inputValue) {
        await navigator.clipboard.writeText(inputValue);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 450);
      }
    };

    const handleClear = useCallback(() => {
      if (onClear) {
        onClear();
        return;
      }
      pushToInput("");
      onChange?.({
        target: { value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    }, [onClear, pushToInput, onChange]);

    const valueAsString = String(value ?? "");
    const hasContent = valueAsString.trim().length > 0;
    const canSubmit =
      !!onSubmit && hasContent && !submitDisabled && !isSubmitting && !disabled;
    const cmdEnterEnabled = submitOnCmdEnter ?? !!onSubmit;

    const triggerSubmit = useCallback(() => {
      if (canSubmit && onSubmit) onSubmit();
    }, [canSubmit, onSubmit]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (isHovered) setIsHovered(false);

        onKeyDown?.(e);
        if (e.defaultPrevented || e.key !== "Enter") return;

        const withCmd = e.metaKey || e.ctrlKey;

        // Field-navigation mode (opt-in via onEnterKey) takes precedence over
        // submit-on-enter: plain Enter advances. Modifier+Enter is left to the
        // caller (a single-line input has no newline to insert).
        if (onEnterKey) {
          if (e.shiftKey || withCmd) return;
          e.preventDefault();
          onEnterKey(e);
          return;
        }

        if (!onSubmit) return;

        if (cmdEnterEnabled && withCmd) {
          e.preventDefault();
          triggerSubmit();
          return;
        }

        if (submitOnEnter && !e.shiftKey && !withCmd) {
          e.preventDefault();
          triggerSubmit();
        }
      },
      [
        isHovered,
        onKeyDown,
        onEnterKey,
        onSubmit,
        cmdEnterEnabled,
        submitOnEnter,
        triggerSubmit,
      ],
    );

    const showHoverControls =
      (isHovered || isRecording || isTranscribing) && !disabled;
    const isVoiceDisabled =
      !isAudioAvailable || disabled || (isTranscribing && !isRecording);
    const showMic = isAudioAvailable;
    const showClear = clearable && hasContent;
    // The "…" menu has at least one item when copy is enabled (extensible).
    const showMenu = !disabled && showCopyButton;
    const rightPadding = rightPaddingClass(!!onSubmit, showClear);

    const isInvalid =
      props["aria-invalid"] === true || props["aria-invalid"] === "true";
    const labelFloated = isFocused || valueAsString.length > 0;
    const showVoiceStatus = isRecording || (isTranscribing && !isRecording);

    return (
      <div
        className={cn("relative group", wrapperClassName)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseMove={() => {
          if (!isHovered) setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
      >
        <input
          ref={inputRef}
          id={inputId}
          type={type}
          placeholder={floatingLabel ? undefined : placeholder}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base placeholder:text-sm shadow-sm placeholder:text-neutral-500 dark:placeholder:text-neutral-400",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            startIcon && "pl-9",
            rightPadding,
            className,
          )}
          style={INPUT_IOS_STYLE}
          value={value}
          onChange={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          {...props}
        />

        {startIcon && (
          <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
            {startIcon}
          </div>
        )}

        {floatingLabel && inputId && (
          <Label
            htmlFor={inputId}
            className={cn(
              "absolute left-3 px-1 pointer-events-none transition-all duration-200 ease-in-out z-10 bg-card",
              labelFloated ? "-top-2 text-xs" : "top-2 text-sm",
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

        {/* Right control cluster — submit/clear always visible when enabled;
            mic + "…" menu float over the text and fade in only on mouse hover
            (never focus). The menu stays visible while its popover is open so
            it can't vanish mid-interaction. Transparent tap buttons sit flush
            inside the h-9 field without glass borders touching the input edge. */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center z-10">
          <div
            className={cn(
              "flex items-center transition-opacity duration-200",
              showHoverControls || menuOpen
                ? "opacity-100"
                : "opacity-0 pointer-events-none",
            )}
          >
            {showMic && (
              <div className="relative">
                {isRecording && (
                  <>
                    <span
                      className="pointer-events-none absolute inset-0 m-auto h-6 w-6 rounded-full bg-primary/20 animate-ping"
                      style={{ animationDuration: "1.5s" }}
                    />
                    <span
                      className="pointer-events-none absolute inset-0 m-auto h-6 w-6 rounded-full bg-primary/15"
                      style={{
                        transform: `scale(${1 + audioLevel / 200})`,
                        transition: "transform 75ms",
                      }}
                    />
                  </>
                )}
                {isTranscribing && !isRecording ? (
                  <LoadingTapButton
                    variant="transparent"
                    ariaLabel="Transcribing"
                    tooltip="Transcribing"
                    className="text-blue-600 dark:text-blue-400"
                  />
                ) : isRecording ? (
                  <MicOffTapButton
                    variant="transparent"
                    onClick={handleVoiceClick}
                    disabled={isVoiceDisabled}
                    ariaLabel="Stop recording"
                    tooltip="Stop recording"
                    className="text-primary"
                  />
                ) : (
                  <MicTapButton
                    variant="transparent"
                    onClick={handleVoiceClick}
                    disabled={isVoiceDisabled}
                    ariaLabel="Start voice input"
                    tooltip="Voice input"
                    className="text-muted-foreground"
                  />
                )}
              </div>
            )}

            {/* Device-picker caret (Anthropic-style) — choose mic / open audio
                settings, hidden while recording so it never crowds the stop
                affordance. */}
            {showMic && !isRecording && !isTranscribing && (
              <MicDeviceMenu disabled={isVoiceDisabled} />
            )}

            {showMenu && (
              <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                <PopoverTrigger asChild>
                  {hasCopied ? (
                    <CheckTapButton
                      variant="transparent"
                      ariaLabel="Copied"
                      tooltip="Copied"
                      className="text-green-500"
                    />
                  ) : (
                    <MoreHorizontalTapButton
                      variant="transparent"
                      ariaLabel="More options"
                      tooltip="More"
                      className="text-muted-foreground"
                    />
                  )}
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  sideOffset={6}
                  className="w-48 p-1"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  {showCopyButton && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleCopy();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>

          {showClear && (
            <XTapButton
              variant="transparent"
              onClick={handleClear}
              ariaLabel="Clear"
              tooltip="Clear"
              className="text-muted-foreground"
            />
          )}

          {onSubmit &&
            (isSubmitting ? (
              <LoadingTapButton
                variant="transparent"
                ariaLabel={submitLabel}
                tooltip={submitLabel}
                className="text-primary"
              />
            ) : (
              <SendTapButton
                variant="transparent"
                onClick={triggerSubmit}
                disabled={!canSubmit}
                ariaLabel={submitLabel}
                tooltip={submitLabel}
                className={canSubmit ? "text-primary" : "text-muted-foreground"}
              />
            ))}
        </div>

        {showVoiceStatus && (
          <div className="absolute left-0 top-full mt-1 flex items-center gap-1.5 px-2 py-1 rounded-md max-w-full">
            {isRecording ? (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 dark:bg-primary/15 rounded-md max-w-full">
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-2 h-2 bg-primary rounded-full flex-shrink-0"
                />
                <span className="text-xs text-primary font-medium truncate">
                  {liveTranscript ? liveTranscript.slice(-60) : "Listening..."}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-md">
                <Loader2 className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  Finalizing...
                </span>
              </div>
            )}
          </div>
        )}

        <VoiceTroubleshootingModal
          isOpen={showTroubleshooting}
          onClose={() => setShowTroubleshooting(false)}
          error={lastError?.message}
          errorCode={lastError?.code}
        />

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
                  <AlertDialogCancel onClick={cancelClose}>
                    Cancel & Wait
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={confirmClose}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isRecording ? "Stop Recording" : "End Transcription"}
                  </AlertDialogAction>
                </>
              ) : (
                <AlertDialogAction onClick={confirmClose}>
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

ProInput.displayName = "ProInput";
