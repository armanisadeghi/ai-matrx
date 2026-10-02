"use client";

/**
 * useCodeEditorWidgetHandle — registers a widget handle for the code editor.
 *
 * Widget tool calls are BUFFERED, not applied live. The editor's displayed
 * code stays stable throughout a streaming turn; only when the stream ends
 * does the orchestrator consume the buffer and transition the UI to Review.
 *
 * Each widget call validates against a running "staged code" — so the agent
 * still gets immediate pass/fail feedback (the tool result the server sees)
 * while the user's view of the code doesn't flicker during streaming.
 *
 * Buffer lifecycle:
 *   - Widget method fires → validates against stagedCode → updates stagedCode
 *     + pushes to edits list → throws on validation failure (agent sees it).
 *   - Orchestrator calls `consumePending()` at stream-end → returns
 *     {edits, stagedCode}, clears internal state.
 *   - If the agent made no widget calls, stagedCode is null and the
 *     orchestrator falls back to parsing SEARCH/REPLACE blocks from the
 *     response text.
 */

import { useMemo, useRef } from "react";
import { useWidgetHandle } from "@ai-matrx/chat/agents/hooks/useWidgetHandle";
import type {
  WidgetHandle,
  WidgetCompletionResult,
  WidgetErrorPayload,
} from "@ai-matrx/chat/agents/types/widget-handle.types";
import { applyCodeEdits } from "../utils/applyCodeEdits";

export interface PendingCodeEdit {
  id: string;
  /** What the agent was trying to do. */
  kind:
    | "replace"
    | "insert_before"
    | "insert_after"
    | "prepend"
    | "append"
    | "patch";
  /** For `patch` — the search text. For other kinds, the previous content. */
  search: string;
  /** The new text. For `patch`, the replacement text. */
  replace: string;
}

export interface ConsumePendingResult {
  edits: PendingCodeEdit[];
  /** The computed final code after all buffered edits are applied in order.
   *  `null` when no widget edits were buffered (caller should try the
   *  SEARCH/REPLACE fallback from the response text). */
  stagedCode: string | null;
}

interface UseCodeEditorWidgetHandleArgs {
  /** Current editor code — used as the base for the FIRST widget edit. */
  code: string;
  /**
   * Legacy "live mode" hook: when provided, widget edits apply immediately
   * to this callback and the internal buffer is NOT used. Use this for
   * surfaces without a review stage (e.g. the multi-file window). When
   * omitted, edits buffer and the orchestrator consumes them at stream-end
   * via `consumePending`.
   */
  onCodeChange?: (next: string) => void;
  /** Optional lifecycle hook forwarded to the underlying handle. */
  onComplete?: (result: WidgetCompletionResult) => void;
  /** Optional lifecycle hook forwarded to the underlying handle. */
  onError?: (err: WidgetErrorPayload) => void;
}

export interface UseCodeEditorWidgetHandleReturn {
  widgetHandleId: string;
  /** Snapshot + clear the buffered widget edits. */
  consumePending: () => ConsumePendingResult;
  /** For debug / display — does NOT clear. */
  peekPending: () => readonly PendingCodeEdit[];
}

// ── Implementation ──────────────────────────────────────────────────────────

export function useCodeEditorWidgetHandle({
  code,
  onCodeChange,
  onComplete,
  onError,
}: UseCodeEditorWidgetHandleArgs): UseCodeEditorWidgetHandleReturn {
  const codeRef = useRef(code);
  codeRef.current = code;

  const onCodeChangeRef = useRef(onCodeChange);
  onCodeChangeRef.current = onCodeChange;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Buffer state (used only when onCodeChange is NOT provided).
  const pendingRef = useRef<PendingCodeEdit[]>([]);
  const stagedCodeRef = useRef<string | null>(null);
  const seqRef = useRef(0);

  const baseForNextEdit = () =>
    stagedCodeRef.current !== null ? stagedCodeRef.current : codeRef.current;

  const nextId = () => `w${++seqRef.current}`;

  // Apply one edit against the current staged code, writing the new staged
  // code on success and throwing on failure. In live mode (onCodeChange
  // provided) we forward the result immediately instead of buffering.
  const stageEdit = (edit: PendingCodeEdit): void => {
    const base = baseForNextEdit();
    let next: string;
    switch (edit.kind) {
      case "replace":
        next = edit.replace;
        break;
      case "insert_before":
      case "prepend":
        next = edit.replace + base;
        break;
      case "insert_after":
      case "append":
        next = base + edit.replace;
        break;
      case "patch": {
        const result = applyCodeEdits(base, [
          { id: edit.id, search: edit.search, replace: edit.replace },
        ]);
        if (!result.success || result.code === undefined) {
          throw new Error(result.errors[0] ?? "applyCodeEdits failed");
        }
        next = result.code;
        break;
      }
    }
    if (onCodeChangeRef.current) {
      // Live mode — skip the buffer entirely.
      onCodeChangeRef.current(next);
      return;
    }
    pendingRef.current.push(edit);
    stagedCodeRef.current = next;
  };

  const handle = useMemo<WidgetHandle>(
    () => ({
      onTextReplace: ({ text }) => {
        stageEdit({
          id: nextId(),
          kind: "replace",
          search: "", // full-document replace — search is not used
          replace: text,
        });
      },
      onTextInsertBefore: ({ text }) => {
        stageEdit({
          id: nextId(),
          kind: "insert_before",
          search: "",
          replace: text,
        });
      },
      onTextInsertAfter: ({ text }) => {
        stageEdit({
          id: nextId(),
          kind: "insert_after",
          search: "",
          replace: text,
        });
      },
      onTextPrepend: ({ text }) => {
        stageEdit({
          id: nextId(),
          kind: "prepend",
          search: "",
          replace: text,
        });
      },
      onTextAppend: ({ text }) => {
        stageEdit({
          id: nextId(),
          kind: "append",
          search: "",
          replace: text,
        });
      },
      onTextPatch: ({ search_text, replacement_text }) => {
        stageEdit({
          id: nextId(),
          kind: "patch",
          search: search_text,
          replace: replacement_text,
        });
      },
      onComplete: (result) => {
        onCompleteRef.current?.(result);
      },
      onError: (err) => {
        onErrorRef.current?.(err);
      },
    }),
    [],
  );

  const widgetHandleId = useWidgetHandle(handle);

  return {
    widgetHandleId,
    consumePending: () => {
      const edits = pendingRef.current;
      const stagedCode = stagedCodeRef.current;
      pendingRef.current = [];
      stagedCodeRef.current = null;
      seqRef.current = 0;
      return { edits, stagedCode };
    },
    peekPending: () => pendingRef.current,
  };
}
