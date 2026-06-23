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
 *   recording or transcription is in flight. ON by default; pass
 *   `enableVoice={false}` to hide the mic + all recording/transcribing
 *   indicators when the host owns recording itself (e.g. a pad whose own
 *   toolbar mic streams into this same controlled value).
 * - **"…" actions menu** — a hover-revealed top-right menu hosting Copy and
 *   agent actions (Clean up, Help with this…, Custom Agent). It floats over the
 *   text (no reserved right gutter) and only appears while the mouse is over
 *   the field; it never shows from focus alone, so it stays out of the way
 *   while typing.
 * - **Agent actions** — each runs an agent over the current text, streams the
 *   result into a popover, and replaces the field on Apply (never auto-mutates):
 *   - **Clean up** — ON by default (`enableCleanup={false}` to hide). Default
 *     agent from the `clean` role on `matrx-user/transcripts-cleanup`.
 *   - **Bound agents** — when `surfaceName` is set, lists agents from
 *     `agx_agent_surface` (My agents / System / Shared / org), same as the
 *     context menu. Pass `getApplicationScope` for full surface scope at run.
 *   - **Help with this…** — OFF by default (`enableHelpWithThis`). Placeholder
 *     default: General Chat (`helpAgentId` to override).
 *   - **Custom Agent** — OFF by default (`enableCustomAgent`). Same flow; no
 *     preset default until `customAgentId` is set (agent filter TBD).
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
  MessageCircle,
  Bot,
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
import { MicDeviceMenu } from "@/components/audio/MicDeviceMenu";
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
import { CLEANUP_SURFACE_NAME } from "@/features/transcription-cleanup/hooks/useAiPostProcess";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { useProTextareaAgentAction } from "./useProTextareaAgentAction";
import { ProTextareaBoundAgentsMenuItems } from "./ProTextareaBoundAgentsMenuItems";
import { useSurfaceBoundAgents } from "@/features/surfaces/hooks/useSurfaceBoundAgents";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { SurfaceBoundAgentEntry } from "@/features/surfaces/services/surface-bound-agents.service";
import {
  isEmbeddedProTextareaAgentAction,
  isProTextareaAgentActionEnabled,
  isProTextareaAgentActionId,
  PRO_TEXTAREA_AGENT_ACTIONS,
  type ProTextareaAgentActionContext,
  type ProTextareaAgentActionId,
  type ProTextareaMenuMode,
} from "./proTextareaAgentActions";
import { ProTextareaAgentPanel } from "./ProTextareaAgentPanel";

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
  /**
   * Voice input (mic control + recording/transcribing indicators). ON by
   * default. Pass `false` when the host owns recording itself (e.g. a pad with
   * its own toolbar mic streaming into this same controlled value) — a second
   * mic would clobber the text. Default true = zero behavior change.
   */
  enableVoice?: boolean;
  autoGrow?: boolean;
  minHeight?: number;
  maxHeight?: number;
  wrapperClassName?: string;
  /** Called when it's safe to close/unmount (after user confirms or recording/transcription completes). */
  onRequestClose?: () => void;
  /** If true, prevents unmounting during recording/transcription with a warning modal. Default: true. */
  protectTranscription?: boolean;
  /** Show the Copy action inside the "…" menu. Default: true. */
  showCopyButton?: boolean;
  /**
   * AI "Clean up" action in the "…" menu. ON by default — any textarea that
   * shows the menu gets cleanup automatically. Pass `false` to exclude it.
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
  /** "Help with this…" agent action in the "…" menu. OFF by default. */
  enableHelpWithThis?: boolean;
  /** Override the help default (General Chat until a surface role ships). */
  helpAgentId?: string | null;
  helpContextItems?: SessionContextItem[];
  /** "Custom Agent" action — same flow, separate entry for a future agent filter. */
  enableCustomAgent?: boolean;
  customAgentId?: string | null;
  customAgentContextItems?: SessionContextItem[];
  /**
   * Surface registry name (`matrx-user/notes`, etc.). When set, the "…" menu
   * lists agents from `agx_agent_surface` (My agents / System / Shared / org).
   */
  surfaceName?: string;
  /**
   * Live scope for surface binding resolution at run time. When omitted,
   * falls back to `{ content, selection }` from the field text.
   */
  getApplicationScope?: () => ApplicationScope;
  /** Context items merged into bound-agent runs (slot fill + ad-hoc). */
  surfaceContextItems?: SessionContextItem[];
  /** Show bound agents in the "…" menu when `surfaceName` is set. Default: true. */
  enableBoundAgents?: boolean;
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
   * Field-navigation mode (opt-in). When provided, plain Enter does NOT insert
   * a newline — instead it calls `onEnterKey` (the caller typically advances
   * focus to the next field / submits). A newline is still reachable: Shift+Enter
   * inserts one naturally and Cmd/Ctrl+Enter inserts one explicitly.
   *
   * This takes precedence over `onSubmit` / `submitOnEnter` for the Enter key,
   * so the two are not meant to be combined. Use this for sequential
   * form-style flows (e.g. tab through variables, then land in the composer).
   */
  onEnterKey?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
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
      enableVoice = true,
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
      enableCleanup = true,
      cleanupAgentId,
      cleanupContextItems,
      enableHelpWithThis = false,
      helpAgentId,
      helpContextItems,
      enableCustomAgent = false,
      customAgentId,
      customAgentContextItems,
      surfaceName,
      getApplicationScope,
      surfaceContextItems,
      enableBoundAgents = true,
      onSubmit,
      submitDisabled,
      isSubmitting = false,
      submitLabel = "Send",
      submitOnCmdEnter,
      submitOnEnter = false,
      onEnterKey,
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
    // action menu and an agent-action view. A single dismissable layer avoids
    // the dropdown-vs-popover focus war that made the view flash + vanish.
    const agentAction = useProTextareaAgentAction();
    const boundAgentsEnabled = Boolean(surfaceName) && enableBoundAgents;
    const {
      sections: boundAgentSections,
      loading: boundAgentsLoading,
      refresh: refreshBoundAgents,
    } = useSurfaceBoundAgents(boundAgentsEnabled ? surfaceName : null);
    const cleanupSurfaceRoles = useSurfaceAgentRoles(CLEANUP_SURFACE_NAME);
    const cleanupSurfaceAgentId =
      cleanupSurfaceRoles.roles.clean?.effectiveAgentId ?? null;
    const agentActionContext = useRef<ProTextareaAgentActionContext>({
      cleanupAgentId,
      cleanupSurfaceAgentId,
      helpAgentId,
      customAgentId,
    });
    agentActionContext.current = {
      cleanupAgentId,
      cleanupSurfaceAgentId,
      helpAgentId,
      customAgentId,
    };
    const agentContextByAction = useRef<
      Record<ProTextareaAgentActionId, SessionContextItem[]>
    >({
      cleanup: cleanupContextItems ?? [],
      help: helpContextItems ?? cleanupContextItems ?? [],
      customAgent: customAgentContextItems ?? cleanupContextItems ?? [],
    });
    agentContextByAction.current = {
      cleanup: cleanupContextItems ?? [],
      help: helpContextItems ?? cleanupContextItems ?? [],
      customAgent: customAgentContextItems ?? cleanupContextItems ?? [],
    };

    const [menuOpen, setMenuOpen] = useState(false);
    const [menuMode, setMenuMode] = useState<ProTextareaMenuMode>("menu");
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
    const [selectedAgentName, setSelectedAgentName] = useState<string | null>(
      null,
    );

    const enabledAgentActionIds = (
      Object.keys(PRO_TEXTAREA_AGENT_ACTIONS) as ProTextareaAgentActionId[]
    ).filter((id) =>
      isProTextareaAgentActionEnabled(id, {
        enableCleanup,
        enableHelpWithThis,
        enableCustomAgent,
      }),
    );
    const activeAgentAction = isProTextareaAgentActionId(menuMode)
      ? PRO_TEXTAREA_AGENT_ACTIONS[menuMode]
      : null;

    // Resolve the chosen agent's display name for the picker label — only once
    // an agent-action view is actually open.
    useEffect(() => {
      if (menuMode === "menu" || !selectedAgent) return;
      let cancelled = false;
      void (async () => {
        const { data } = await supabase
          .from("agx_agent")
          .select("name")
          .eq("id", selectedAgent)
          .maybeSingle();
        if (!cancelled) setSelectedAgentName(data?.name ?? null);
      })();
      return () => {
        cancelled = true;
      };
    }, [selectedAgent, menuMode]);

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

    // Insert a newline at the caret without leaving the field. Used by the
    // field-navigation mode (`onEnterKey`) so Cmd/Ctrl+Enter can still produce
    // a line break even though plain Enter is repurposed for "next field".
    const insertNewlineAtCursor = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + "\n" + el.value.slice(end);
      pushToTextarea(next);
      const caret = start + 1;
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        node.selectionStart = caret;
        node.selectionEnd = caret;
      });
    }, [pushToTextarea]);

    // ── Menu + agent actions ───────────────────────────────────────────────
    const handleMenuOpenChange = useCallback(
      (open: boolean) => {
        setMenuOpen(open);
        if (open && boundAgentsEnabled) {
          void refreshBoundAgents();
        }
        if (!open) {
          setMenuMode("menu");
          setSelectedAgent(null);
          setSelectedAgentName(null);
          agentAction.reset();
        }
      },
      [agentAction, boundAgentsEnabled, refreshBoundAgents],
    );

    const resolveApplicationScope = useCallback(
      (text: string): ApplicationScope => {
        if (getApplicationScope) return getApplicationScope();
        const el = textareaRef.current;
        const start = el?.selectionStart ?? 0;
        const end = el?.selectionEnd ?? 0;
        const selection =
          start !== end && el
            ? el.value.slice(Math.min(start, end), Math.max(start, end))
            : "";
        return {
          content: text,
          selection,
          text_before: el ? el.value.slice(0, start) : "",
          text_after: el ? el.value.slice(end) : "",
        };
      },
      [getApplicationScope],
    );

    const resolveAgentContextItems = useCallback(
      (actionId: ProTextareaAgentActionId | "boundAgent") => {
        if (actionId === "boundAgent") {
          return surfaceContextItems ?? [];
        }
        return (
          agentContextByAction.current[actionId as ProTextareaAgentActionId] ??
          []
        );
      },
      [surfaceContextItems],
    );

    const openBoundAgentView = useCallback(
      (entry: SurfaceBoundAgentEntry) => {
        const text = textareaRef.current?.value ?? valueAsString;
        if (!text.trim()) {
          toast.info("Add some text before running an agent");
          return;
        }
        agentAction.reset();
        setMenuMode("boundAgent");
        setSelectedAgent(entry.agentId);
        setSelectedAgentName(entry.name);
      },
      [agentAction, valueAsString],
    );

    const openAgentActionView = useCallback(
      (actionId: ProTextareaAgentActionId) => {
        const definition = PRO_TEXTAREA_AGENT_ACTIONS[actionId];
        const text = textareaRef.current?.value ?? valueAsString;
        if (definition.requiresSourceText && !text.trim()) {
          toast.info(definition.emptyTextToast);
          return;
        }
        if (actionId === "cleanup") {
          agentAction.reset();
        }
        setMenuMode(actionId);
        setSelectedAgent(
          definition.resolveDefaultAgentId(agentActionContext.current),
        );
        setSelectedAgentName(null);
      },
      [agentAction, valueAsString],
    );

    const applyEmbeddedSourceText = useCallback(
      (text: string) => {
        pushToTextarea(text);
      },
      [pushToTextarea],
    );

    const handleEmbeddedAgentChange = useCallback((agentId: string) => {
      setSelectedAgent(agentId);
      setSelectedAgentName(null);
    }, []);

    const exitEmbeddedAgentView = useCallback(() => {
      setMenuMode("menu");
      setSelectedAgent(null);
      setSelectedAgentName(null);
    }, []);

    const clearEmbeddedAgent = useCallback(() => {
      setSelectedAgent(null);
      setSelectedAgentName(null);
    }, []);

    const runActiveAgentAction = useCallback(() => {
      if (
        menuMode === "menu" ||
        (isProTextareaAgentActionId(menuMode) &&
          isEmbeddedProTextareaAgentAction(menuMode))
      ) {
        return;
      }
      const text = textareaRef.current?.value ?? valueAsString;
      if (!text.trim()) {
        toast.info(
          menuMode === "boundAgent"
            ? "Add some text before running an agent"
            : PRO_TEXTAREA_AGENT_ACTIONS[menuMode].emptyTextToast,
        );
        return;
      }
      if (!selectedAgent) {
        toast.info(
          menuMode === "boundAgent"
            ? "Choose an agent first"
            : PRO_TEXTAREA_AGENT_ACTIONS[menuMode].chooseAgentToast,
        );
        return;
      }
      void agentAction.run(
        text,
        selectedAgent,
        resolveAgentContextItems(menuMode),
        {
          surfaceName: menuMode === "boundAgent" ? surfaceName : undefined,
          applicationScope: resolveApplicationScope(text),
        },
      );
    }, [
      agentAction,
      menuMode,
      resolveAgentContextItems,
      resolveApplicationScope,
      selectedAgent,
      surfaceName,
      valueAsString,
    ]);

    const applyActiveAgentAction = useCallback(() => {
      if (
        menuMode === "menu" ||
        (isProTextareaAgentActionId(menuMode) &&
          isEmbeddedProTextareaAgentAction(menuMode))
      ) {
        return;
      }
      const result = agentAction.result.trim();
      if (!result) return;
      pushToTextarea(agentAction.result);
      setMenuOpen(false);
      setMenuMode("menu");
      setSelectedAgent(null);
      setSelectedAgentName(null);
      agentAction.reset();
      toast.success(
        menuMode === "boundAgent"
          ? "Agent response applied"
          : PRO_TEXTAREA_AGENT_ACTIONS[menuMode].applySuccessToast,
      );
    }, [agentAction, menuMode, pushToTextarea]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Mirror the browser's "hide cursor while typing" behavior: any
        // keypress hides the hover controls until the mouse moves again.
        // Without this, the icons remain visible even though the OS cursor
        // has vanished, which feels noisy mid-thought.
        if (isHovered) setIsHovered(false);

        onKeyDown?.(e);
        if (e.defaultPrevented || e.key !== "Enter") return;

        const withCmd = e.metaKey || e.ctrlKey;

        // Field-navigation mode (opt-in via onEnterKey) takes precedence over
        // submit-on-enter: plain Enter advances; Shift+Enter is a natural
        // newline; Cmd/Ctrl+Enter inserts one explicitly.
        if (onEnterKey) {
          if (e.shiftKey) return;
          if (withCmd) {
            e.preventDefault();
            insertNewlineAtCursor();
            return;
          }
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
        insertNewlineAtCursor,
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
    // typing and reappears on motion. The controls float OVER the text (no
    // reserved right gutter), so they only overlap content while hovering —
    // never while the user is typing.
    const showControls =
      (isHovered || isRecording || isTranscribing) && !disabled;
    const isVoiceDisabled =
      !isAudioAvailable || disabled || (isTranscribing && !isRecording);

    const showBoundAgentsMenu = boundAgentsEnabled;
    const showMenu =
      !disabled &&
      (showCopyButton ||
        enabledAgentActionIds.length > 0 ||
        showBoundAgentsMenu);

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
            // The top-right controls float OVER the text — no reserved right
            // gutter. They're hidden while typing (hover-only) so they never
            // sit on top of text the user is actively editing.
            "pr-3",
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

        {/* Top-right control cluster (mic + "…" menu) — floats OVER the text
            and fades in only on mouse hover (never focus), so it stays out of
            the way while typing. It also stays visible while the menu popover
            is open so it can't vanish mid-interaction. */}
        <div
          className={cn(
            "absolute right-0 top-0 flex items-center transition-opacity duration-200 z-10",
            showControls || menuOpen
              ? "opacity-100"
              : "opacity-0 pointer-events-none",
          )}
        >
          {enableVoice && isAudioAvailable && (
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

          {/* Device-picker caret — choose mic / open audio settings. Hidden
              while recording so it never crowds the stop affordance. */}
          {enableVoice && isAudioAvailable && !isRecording && !isTranscribing && (
            <MicDeviceMenu disabled={isVoiceDisabled} />
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
                className={cn(
                  "p-0",
                  menuMode === "menu"
                    ? showBoundAgentsMenu
                      ? "w-56 max-h-[70dvh] overflow-y-auto"
                      : "w-48"
                    : isProTextareaAgentActionId(menuMode) &&
                        isEmbeddedProTextareaAgentAction(menuMode)
                      ? "w-auto max-w-none"
                      : "w-80",
                )}
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
                    {enabledAgentActionIds.map((actionId) => {
                      const definition = PRO_TEXTAREA_AGENT_ACTIONS[actionId];
                      const icon =
                        actionId === "cleanup" ? (
                          <Sparkles className="h-4 w-4 text-primary" />
                        ) : actionId === "help" ? (
                          <MessageCircle className="h-4 w-4 text-primary" />
                        ) : (
                          <Bot className="h-4 w-4 text-primary" />
                        );
                      return (
                        <button
                          key={actionId}
                          type="button"
                          onClick={() => openAgentActionView(actionId)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          {icon}
                          {definition.menuLabel}
                        </button>
                      );
                    })}
                    {showBoundAgentsMenu && (
                      <ProTextareaBoundAgentsMenuItems
                        loading={boundAgentsLoading}
                        sections={boundAgentSections}
                        onSelect={openBoundAgentView}
                      />
                    )}
                  </div>
                ) : isProTextareaAgentActionId(menuMode) &&
                  isEmbeddedProTextareaAgentAction(menuMode) ? (
                  <ProTextareaAgentPanel
                    actionId={menuMode}
                    agentId={selectedAgent}
                    agentLabel={selectedAgentName}
                    onAgentIdChange={handleEmbeddedAgentChange}
                    onAgentClear={clearEmbeddedAgent}
                    sourceText={valueAsString}
                    onApplySourceText={applyEmbeddedSourceText}
                    onBack={exitEmbeddedAgentView}
                    onCancel={() => setMenuOpen(false)}
                  />
                ) : activeAgentAction || menuMode === "boundAgent" ? (
                  <AgentActionPopoverBody
                    title={
                      menuMode === "boundAgent"
                        ? (selectedAgentName ?? "Bound agent")
                        : activeAgentAction!.popoverTitle
                    }
                    phase={agentAction.phase}
                    isBusy={agentAction.isBusy}
                    isThinking={agentAction.isThinking}
                    result={agentAction.result}
                    error={agentAction.error}
                    agentName={selectedAgentName}
                    onSelectAgent={setSelectedAgent}
                    onRun={runActiveAgentAction}
                    canRun={Boolean(selectedAgent) && !agentAction.isBusy}
                    onApply={applyActiveAgentAction}
                    onBack={() => {
                      setMenuMode("menu");
                      setSelectedAgent(null);
                      setSelectedAgentName(null);
                      agentAction.reset();
                    }}
                    onCancel={() => setMenuOpen(false)}
                  />
                ) : null}
              </PopoverContent>
            </Popover>
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

        {enableVoice && isRecording && (
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
        {enableVoice && isTranscribing && !isRecording && (
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

/**
 * Agent action view: picker + Run, streamed result, Apply / Re-run / Cancel.
 */
function AgentActionPopoverBody({
  title,
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
  title: string;
  phase: ReturnType<typeof useProTextareaAgentAction>["phase"];
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
          {title}
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
