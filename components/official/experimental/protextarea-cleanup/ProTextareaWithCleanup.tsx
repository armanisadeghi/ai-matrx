/**
 * ProTextareaWithCleanup — EXPERIMENTAL replica of `components/official/ProTextarea`
 * with an AI "Clean up" action added.
 *
 * This is a temporary, exact copy of ProTextarea so we can trial the cleanup
 * flow without touching the canonical component. The ONLY differences from
 * ProTextarea are:
 *
 *   1. The top-right copy button is replaced by an always-present "…" menu
 *      (MoreHorizontal). Copy moves into that menu; "Clean up" joins it (gated
 *      by `enableCleanup`). The menu is the natural home for future actions
 *      (spell-check, tone, translate, …).
 *   2. "Clean up" sends the FULL current text to a cleanup agent (the same
 *      default agent the `/transcripts/cleanup` page uses, via the surface
 *      "clean" role — overridable with `cleanupAgentId`) and streams the result
 *      into a POPOVER. The textarea is never mutated until the user clicks
 *      Apply. Cancel / Redo are offered alongside.
 *   3. The mic / voice-input button is UNTOUCHED (same hover-revealed behavior).
 *
 * Once validated, fold the menu + cleanup into the canonical ProTextarea and
 * delete this experimental tree.
 */

"use client";

import React, { useCallback, useState, useRef, useEffect, useId } from "react";
import {
  Copy,
  Check,
  Mic,
  Loader2,
  Send,
  MoreHorizontal,
  Sparkles,
  RotateCcw,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  TapTargetButton,
  TapTargetButtonSolid,
} from "@/components/icons/TapTargetButton";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { supabase } from "@/utils/supabase/client";
import type { SessionContextItem } from "@/features/transcript-studio/types";
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
import { useProTextareaCleanup } from "./useProTextareaCleanup";

/** Real HTMLTextAreaElement with optional expando methods set by the textarea. */
export interface ProTextareaWithCleanupElement extends HTMLTextAreaElement {
  requestClose?: () => void;
  isTranscribing?: () => boolean;
}

export interface ProTextareaWithCleanupProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
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
  /** Show the copy action in the "…" menu. Default: true. */
  showCopyButton?: boolean;
  /**
   * Feature gate for the AI cleanup action. When false (default) the "…" menu
   * shows only Copy and other non-cleanup actions. Clients opt in per-surface.
   */
  enableCleanup?: boolean;
  /**
   * Override the cleanup agent. When omitted, the agent is resolved from the
   * shared cleanup surface "clean" role (same default as the cleanup page).
   */
  cleanupAgentId?: string | null;
  /**
   * Context blocks the host page wants the cleanup agent to receive. Each item
   * whose `key` matches an agent-declared context slot fills that slot; the
   * rest ride as ad-hoc context entries (same handling as the cleanup page).
   */
  cleanupContextItems?: SessionContextItem[];
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
   * suppressed. Use only in a `bg-card` surface.
   */
  floatingLabel?: string;
}

export const ProTextareaWithCleanup = React.forwardRef<
  HTMLTextAreaElement,
  ProTextareaWithCleanupProps
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
      enableCleanup = false,
      cleanupAgentId,
      cleanupContextItems,
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

    // ── "…" menu popover ───────────────────────────────────────────────────
    // ONE Popover anchored at the "…" button. Its content swaps between the
    // action menu and the cleanup view. A single dismissable layer avoids the
    // dropdown-vs-popover focus war that made the cleanup view flash + vanish.
    const cleanup = useProTextareaCleanup({ agentId: cleanupAgentId });
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuMode, setMenuMode] = useState<"menu" | "cleanup">("menu");
    // Latest context items, mirrored so the async run never reads a stale prop.
    const cleanupContextRef = useRef<SessionContextItem[]>(
      cleanupContextItems ?? [],
    );
    cleanupContextRef.current = cleanupContextItems ?? [];
    // The agent the user has chosen for cleanup (seeded from the surface
    // default). The user picks from the same agent list the cleanup page uses;
    // nothing runs until they click "Clean up".
    const [cleanupAgent, setCleanupAgent] = useState<string | null>(null);
    const [cleanupAgentName, setCleanupAgentName] = useState<string | null>(
      null,
    );

    // Seed the selection from the surface "clean" role default once resolved.
    useEffect(() => {
      if (cleanup.defaultAgentId && !cleanupAgent) {
        setCleanupAgent(cleanup.defaultAgentId);
      }
    }, [cleanup.defaultAgentId, cleanupAgent]);

    // Resolve the chosen agent's display name for the picker label.
    useEffect(() => {
      if (!cleanupAgent) {
        setCleanupAgentName(null);
        return;
      }
      let cancelled = false;
      void (async () => {
        const { data } = await supabase
          .from("agx_agent")
          .select("name")
          .eq("id", cleanupAgent)
          .maybeSingle();
        if (!cancelled) setCleanupAgentName(data?.name ?? null);
      })();
      return () => {
        cancelled = true;
      };
    }, [cleanupAgent]);

    // Check if audio is available
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

    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      (el as ProTextareaWithCleanupElement).requestClose = handleCloseRequest;
      (el as ProTextareaWithCleanupElement).isTranscribing = () =>
        isTranscribing;
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

    // ── Menu + cleanup actions ─────────────────────────────────────────────
    const handleMenuOpenChange = useCallback(
      (open: boolean) => {
        setMenuOpen(open);
        if (!open) {
          // Closing the popover always returns it to the action menu and drops
          // any in-flight cleanup state.
          setMenuMode("menu");
          cleanup.reset();
        }
      },
      [cleanup],
    );

    // Open the cleanup view (agent picker + Run). Never auto-runs.
    const openCleanupView = useCallback(() => {
      const text = textareaRef.current?.value ?? valueAsString;
      if (!text.trim()) {
        toast.info("Add some text before cleaning it up");
        return;
      }
      cleanup.reset();
      setMenuMode("cleanup");
    }, [cleanup, valueAsString]);

    const runCleanup = useCallback(() => {
      const text = textareaRef.current?.value ?? valueAsString;
      if (!text.trim()) {
        toast.info("Add some text before cleaning it up");
        return;
      }
      if (!cleanupAgent) {
        toast.info("Choose a cleanup agent first");
        return;
      }
      void cleanup.run(text, cleanupAgent, cleanupContextRef.current);
    }, [cleanup, cleanupAgent, valueAsString]);

    const applyCleanup = useCallback(() => {
      const result = cleanup.result.trim();
      if (!result) return;
      pushToTextarea(cleanup.result);
      setMenuOpen(false);
      setMenuMode("menu");
      cleanup.reset();
      toast.success("Cleaned text applied");
    }, [cleanup, pushToTextarea]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    const showControls =
      (isHovered || isRecording || isTranscribing) && !disabled;
    const isVoiceDisabled =
      !isAudioAvailable || disabled || (isTranscribing && !isRecording);

    // The "…" menu has at least one item when copy or cleanup is enabled.
    const showMenu = !disabled && (showCopyButton || enableCleanup);
    const showTopRightControls = isAudioAvailable || showMenu;

    const isInvalid =
      props["aria-invalid"] === true || props["aria-invalid"] === "true";
    const labelFloated = isFocused || valueAsString.length > 0;

    return (
      <div
        className={cn("relative group", wrapperClassName)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseMove={() => {
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
            autoGrow && "resize-none overflow-hidden",
            // Static right-padding to clear two TapTargetButtons (44px each
            // = 88px total) at the top-right.
            showTopRightControls ? "pr-24" : "pr-3",
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

        {/* Top-right control cluster: mic (hover-revealed, UNTOUCHED) + the
            always-present "…" menu. The cleanup popover anchors to the menu.
            The mic stays OUTSIDE the (hydration-gated) Popover so its first
            paint is identical to the canonical ProTextarea. */}
        <div className="absolute right-0 top-0 z-10 flex items-center">
          {isAudioAvailable && (
            <div
              className={cn(
                "relative transition-opacity duration-200",
                showControls ? "opacity-100" : "opacity-0 pointer-events-none",
              )}
            >
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

          {showMenu && (
            <Popover open={menuOpen} onOpenChange={handleMenuOpenChange}>
              <PopoverTrigger asChild>
                <TapTargetButton
                  ariaLabel="More options"
                  tooltip="More"
                  className={
                    hasCopied ? "text-green-500" : "text-muted-foreground"
                  }
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
                      <MoreHorizontal className="h-4 w-4" />
                    )
                  }
                />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                sideOffset={6}
                className={cn("p-0", menuMode === "cleanup" ? "w-80" : "w-48")}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {menuMode === "menu" ? (
                  <div className="flex flex-col p-1">
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
                    {enableCleanup && (
                      <button
                        type="button"
                        onClick={openCleanupView}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Sparkles className="h-4 w-4 text-primary" />
                        Clean up
                      </button>
                    )}
                  </div>
                ) : (
                  <CleanupPopoverBody
                    phase={cleanup.phase}
                    isBusy={cleanup.isBusy}
                    isThinking={cleanup.isThinking}
                    result={cleanup.result}
                    error={cleanup.error}
                    agentName={cleanupAgentName}
                    onSelectAgent={setCleanupAgent}
                    onRun={runCleanup}
                    canRun={Boolean(cleanupAgent) && !cleanup.isBusy}
                    onApply={applyCleanup}
                    onBack={() => {
                      setMenuMode("menu");
                      cleanup.reset();
                    }}
                    onCancel={() => setMenuOpen(false)}
                  />
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Submit Button (bottom-right) */}
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

ProTextareaWithCleanup.displayName = "ProTextareaWithCleanup";

/**
 * The cleanup view: an agent picker (same list as the cleanup page) + an
 * explicit Run button (never auto-runs), then the streamed result with
 * Apply / Re-run / Cancel.
 */
function CleanupPopoverBody({
  phase,
  isBusy,
  isThinking,
  result,
  error,
  agentName,
  onSelectAgent,
  onRun,
  canRun,
  onApply,
  onBack,
  onCancel,
}: {
  phase: ReturnType<typeof useProTextareaCleanup>["phase"];
  isBusy: boolean;
  isThinking: boolean;
  result: string;
  error: string | null;
  agentName: string | null;
  onSelectAgent: (agentId: string) => void;
  onRun: () => void;
  canRun: boolean;
  onApply: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const isError = phase === "error" || phase === "timeout";
  const isComplete = phase === "complete";
  const hasResult = result.trim().length > 0;
  const hasRun = phase !== "idle";

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Clean up
          {isBusy && (
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isThinking ? "Thinking…" : "Working…"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Agent picker + Run — same agent list the cleanup page uses. */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <AgentListDropdown
            onSelect={onSelectAgent}
            label={agentName ?? "Choose an agent…"}
            className="w-full"
          />
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
            !canRun
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : hasRun ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {hasRun ? "Re-run" : "Run"}
        </button>
      </div>

      {/* Result area — empty until the user runs. */}
      {hasRun && (
        <div className="max-h-56 overflow-y-auto px-3 py-2.5">
          {isError ? (
            <p className="text-xs text-destructive">
              {error ?? "Something went wrong. Please try again."}
            </p>
          ) : hasResult ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {result}
            </p>
          ) : (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing your text…
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Back
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!isComplete || !hasResult}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors",
              !isComplete || !hasResult
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Check className="h-3.5 w-3.5" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
