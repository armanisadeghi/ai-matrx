"use client";

import { tabToFileIdentity } from "../utils/fileIdentity";

import { useCallback, type MutableRefObject } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import type { StandaloneCodeEditor } from "../editor/MonacoEditor";
import type { EditorFile } from "../types";
import { isPreviewTab } from "../types";
import { editorSelectionKey } from "./editorContextEntries";

export interface SelectionContextValue {
  identity: ReturnType<typeof tabToFileIdentity>;
  id: string;
  path: string;
  name: string;
  language: string;
  selection: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  text: string;
  capturedAt: string;
}

export interface UseSendSelectionAsContextOptions {
  conversationId: string | null | undefined;
  activeTab: EditorFile | null | undefined;
  editorRef: MutableRefObject<StandaloneCodeEditor | null>;
  /**
   * Optional toast hook. When provided we'll surface a brief confirmation /
   * error message instead of relying on the caller. Defaults to no-op so the
   * hook stays decoupled from any toast library.
   */
  notify?: (msg: { type: "success" | "error"; text: string }) => void;
}

/**
 * Capture the current Monaco selection from the active tab and publish it as
 * a one-off `editor.selection.<tabId>` entry on the agent's instanceContext.
 * Returns a stable callback that's safe to wire to a Monaco command, a
 * toolbar button, or both.
 *
 * The selection is overwritten in place if the user fires the command twice
 * in a row — agents typically read it once during a turn, so a stale entry
 * isn't useful.
 */
export function useSendSelectionAsContext(
  opts: UseSendSelectionAsContextOptions,
): {
  sendSelection: () => boolean;
  canSend: boolean;
} {
  const { conversationId, activeTab, editorRef, notify } = opts;
  const dispatch = useAppDispatch();
  // Preview tabs (binary-preview / cloud-file-preview) don't mount
  // Monaco, so there's nothing to select. Disable the toolbar action
  // up-front rather than letting users click into a "no text selected"
  // toast.
  const canSend = Boolean(
    conversationId && activeTab && !isPreviewTab(activeTab.kind),
  );

  const sendSelection = useCallback((): boolean => {
    if (!conversationId || !activeTab) {
      notify?.({
        type: "error",
        text: "Open a chat conversation first to send selection",
      });
      return false;
    }
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!editor || !selection || !model || selection.isEmpty()) {
      notify?.({
        type: "error",
        text: "No text selected — drag to select code first",
      });
      return false;
    }
    const text = model.getValueInRange({
      startLineNumber: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn,
    });
    if (!text) {
      notify?.({ type: "error", text: "Selection is empty" });
      return false;
    }
    const value: SelectionContextValue = {
      identity: tabToFileIdentity(activeTab),
      id: activeTab.id,
      path: activeTab.path,
      name: activeTab.name,
      language: activeTab.language,
      selection: {
        startLine: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLine: selection.endLineNumber,
        endColumn: selection.endColumn,
      },
      text,
      capturedAt: new Date().toISOString(),
    };
    dispatch(
      setContextEntry({
        conversationId,
        key: editorSelectionKey(activeTab.id),
        value,
        type: "json",
        label: `Selection: ${activeTab.name} L${selection.startLineNumber}–${selection.endLineNumber}`,
      }),
    );
    notify?.({
      type: "success",
      text: `Selection sent (${text.length} chars from ${activeTab.name})`,
    });
    return true;
  }, [conversationId, activeTab, editorRef, dispatch, notify]);

  return { sendSelection, canSend };
}
