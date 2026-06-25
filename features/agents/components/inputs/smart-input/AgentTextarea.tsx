"use client";

/**
 * AgentTextarea
 *
 * The composing surface for agent input — textarea, auto-resize, expand toggle,
 * clipboard paste, and undo/redo keyboard shortcuts.
 *
 * Voice input is NOT handled here. The microphone button lives in the action
 * bar beside this textarea and writes transcripts into the same
 * `userInputText` Redux slice that this component reads — there's no voice
 * state plumbed through this component or its parents.
 *
 * Only requires conversationId. Everything else comes from Redux or config
 * props.
 */

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectUserInputText,
  selectInputCharCount,
  selectSubmissionPhase,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  selectSubmitOnEnter,
  selectInputPlaceholder,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import { usePasteImageResource } from "@/features/agents/components/inputs/resources/usePasteImageResource";
import { useInstanceInputUndoRedo } from "@/features/agents/hooks/useInstanceInputUndoRedo";
import {
  smartExecute,
  cancelExecution,
} from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { selectUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";

// ── Props ────────────────────────────────────────────────────────────────────

interface AgentTextareaProps {
  conversationId: string;
  compact?: boolean;
  /** Render as a single-line input-like textarea (no expand toggle, minimal height) */
  singleRow?: boolean;
  uploadBucket?: string;
  uploadPath?: string;
  enablePasteImages?: boolean;
  surfaceKey?: string;
  disableSend?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────
//
// Settings (placeholder, etc.) come from Redux — NOT props. Surfaces that want
// to customize the textarea behaviour dispatch the appropriate setter against
// their conversationId before rendering. This keeps the input subtree
// self-sufficient and identical across every surface that mounts it.

export function AgentTextarea({
  conversationId,
  compact = false,
  singleRow = false,
  uploadBucket = "userContent",
  uploadPath = "agent-attachments",
  enablePasteImages = true,
  surfaceKey,
  disableSend = false,
}: AgentTextareaProps) {
  const dispatch = useAppDispatch();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  // When collapsing back from expanded mode (e.g. after submit) we want a
  // longer, eased transition for a smooth glide down — distinct from the fast
  // per-keystroke auto-resize, which must stay snappy to avoid flicker.
  const [isCollapsing, setIsCollapsing] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const collapseSmoothly = useCallback(() => {
    setIsCollapsing(true);
    setIsExpanded(false);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setIsCollapsing(false), 350);
  }, []);

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

  // Redux — primitive selectors, no object churn
  const inputText = useAppSelector(selectUserInputText(conversationId));
  const charCount = useAppSelector(selectInputCharCount(conversationId));
  const submissionPhase = useAppSelector(selectSubmissionPhase(conversationId));
  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));

  // While a submit is in flight (phase "pending"), hide the message from the
  // box so it appears to move straight into the conversation. The text stays in
  // Redux (`entry.text`) as the non-visual backup that `assembleRequest` reads
  // to build the request — it is NOT cleared here. On success it's cleared for
  // real (markInputPersisted); on failure clearUserInput keeps the box empty
  // (the message survives as the failed turn + the re-apply backup).
  const isSubmitting = submissionPhase === "pending";
  const visibleText = isSubmitting ? "" : inputText;
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const reduxPlaceholder = useAppSelector(
    selectInputPlaceholder(conversationId),
  );

  // Variable values for undo snapshot co-capture (stable EMPTY_RECORD when unset)
  const currentUserValues = useAppSelector(
    selectUserVariableValues(conversationId),
  );

  // Undo/redo — intercepts Cmd+Z / Ctrl+Z
  useInstanceInputUndoRedo({ conversationId });

  // After a submit the input is emptied, so expanded mode no longer makes
  // sense — glide it back down smoothly. Triggered when the submission enters
  // its in-flight ("pending") phase while the box is expanded.
  useEffect(() => {
    if (isSubmitting && isExpanded) {
      collapseSmoothly();
    }
  }, [isSubmitting, isExpanded, collapseSmoothly]);

  // Expand icon: show whenever expanded OR text is long enough to need it (hidden in singleRow)
  const showExpand =
    !singleRow && (isExpanded || (isSubmitting ? 0 : charCount) > 80);

  const handleSend = useCallback(() => {
    if (disableSend) return;
    if (isExecuting) {
      dispatch(cancelExecution(conversationId));
    } else {
      dispatch(smartExecute({ conversationId, surfaceKey }));
    }
  }, [disableSend, isExecuting, conversationId, surfaceKey, dispatch]);

  // ── Paste image ─────────────────────────────────────────────────────────────
  // Canonical paste→upload→attach flow, shared by every composer.
  const handlePasteImage = usePasteImageResource(conversationId, {
    uploadBucket,
    uploadPath,
  });

  useClipboardPaste({
    textareaRef,
    onPasteImage: handlePasteImage,
    disabled: !enablePasteImages,
  });

  // ── Text change ─────────────────────────────────────────────────────────────
  const handleTextChange = useCallback(
    (value: string) => {
      dispatch(
        setUserInputText({
          conversationId,
          text: value,
          userValues: currentUserValues,
        }),
      );
    },
    [conversationId, currentUserValues, dispatch],
  );

  // ── Key down ────────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return;
      const withCmd = e.metaKey || e.ctrlKey;
      // submitOnEnter ON  → Enter sends, Shift+Enter is a newline.
      // submitOnEnter OFF → Enter is a newline, ⌘/Ctrl+Enter sends.
      const shouldSend = submitOnEnter ? !e.shiftKey && !withCmd : withCmd;
      if (!shouldSend) return;
      e.preventDefault();
      if (!disableSend && !isExecuting) handleSend();
    },
    [submitOnEnter, disableSend, isExecuting, handleSend],
  );

  // ── Auto-resize ─────────────────────────────────────────────────────────────
  // Sync, pre-paint layout. No transitions, no wrapper animation, no timeouts —
  // the textarea grows directly from its own scrollHeight. This is the key to
  // stability: any attempt to animate height on each keystroke produces flicker
  // as overlapping 300ms transitions stack on top of each other.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (singleRow) {
      el.style.height = "20px";
      return;
    }

    if (isExpanded) {
      const target = Math.max(Math.floor(window.innerHeight * 0.6) - 80, 200);
      el.style.height = `${target}px`;
      return;
    }

    const minH = compact ? 20 : 40;
    el.style.height = "auto"; // reset so scrollHeight reflects actual content
    const natural = Math.max(minH, Math.min(el.scrollHeight, 200));
    el.style.height = `${natural}px`;
  }, [visibleText, isExpanded, singleRow, compact]);

  // ── Auto-focus ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [conversationId]);

  const placeholderText =
    reduxPlaceholder ??
    (isExpanded ? "Add a message..." : "Type your message...");

  if (singleRow) {
    return (
      <div className="relative flex items-center min-w-0">
        <textarea
          ref={textareaRef}
          value={visibleText}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className="w-full bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground/60 resize-none overflow-hidden leading-5"
          style={{ minHeight: 20, maxHeight: 20 }}
          rows={1}
          data-agent-main-input
        />
      </div>
    );
  }

  return (
    <div className="px-2 relative shrink-0">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={visibleText}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className={`w-full bg-transparent border-none outline-none text-base text-foreground placeholder:text-muted-foreground/60 resize-none overflow-y-auto scrollbar-hide leading-7 transition-[height] motion-reduce:transition-none ${
            isCollapsing
              ? "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              : "duration-150 ease-out"
          }`}
          style={{ minHeight: compact ? 28 : 40 }}
          rows={1}
          data-agent-main-input
        />
        {showExpand && (
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="absolute top-1 right-1 p-1 rounded-full hover:bg-muted/80 opacity-50 hover:opacity-100 transition-all"
            title={isExpanded ? "Collapse input" : "Expand input"}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
