"use client";

import { useEffect, type MutableRefObject } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { StandaloneCodeEditor } from "../editor/MonacoEditor";
import type { EditorFile } from "../types";
import { editorSelectionKey, editorTabKey } from "./editorContextEntries";

interface UseEditorContextMenuActionsOptions {
  editorRef: MutableRefObject<StandaloneCodeEditor | null>;
  /**
   * Bump-counter the host increments when Monaco's `onMount` fires. We can't
   * depend on the ref directly (refs don't trigger re-renders), so a
   * monotonically increasing tick is the cleanest way to re-run the
   * registration effect once the editor instance is actually attached.
   */
  editorReadyTick: number;
  /**
   * The active tab. The hook re-registers actions when this changes so
   * "Send file to chat" always references the right buffer.
   */
  activeTab: EditorFile | null | undefined;
  /**
   * The id of the conversation the editor is bound to. When null, the
   * "Send to chat" actions explain what's missing instead of vanishing —
   * keeping the menu's affordances stable across chat states.
   */
  conversationId: string | null | undefined;
  /** Optional toast hook so callers can wire user-visible feedback. */
  notify?: (msg: { type: "success" | "error" | "info"; text: string }) => void;
  /** Last-resort agent id for the floating Run window. Falls back to the
   *  user's "lastAgentId" preference if absent (handled by the window). */
  defaultAgentId?: string | null;
}

/**
 * Adds Monaco right-click context-menu actions for AI workflows:
 *
 *   - "Send selection to chat"   (push editor.selection.<id> to instanceContext)
 *   - "Send file to chat"        (push editor.tab.<id> to instanceContext)
 *   - "Ask AI in floating window…"  (open AgentRunWindow seeded with selection)
 *
 * All actions are no-ops when their preconditions aren't met (e.g. no
 * selection). Disposables are torn down on unmount or when the editor /
 * inputs change.
 */
export function useEditorContextMenuActions({
  editorRef,
  editorReadyTick,
  activeTab,
  conversationId,
  notify,
  defaultAgentId,
}: UseEditorContextMenuActionsOptions): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeTab) return undefined;

    const disposables: Array<{ dispose: () => void }> = [];

    const captureSelectionText = (): {
      text: string;
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    } | null => {
      const sel = editor.getSelection();
      const model = editor.getModel();
      if (!sel || !model || sel.isEmpty()) return null;
      const text = model.getValueInRange({
        startLineNumber: sel.startLineNumber,
        startColumn: sel.startColumn,
        endLineNumber: sel.endLineNumber,
        endColumn: sel.endColumn,
      });
      if (!text) return null;
      return {
        text,
        startLine: sel.startLineNumber,
        startColumn: sel.startColumn,
        endLine: sel.endLineNumber,
        endColumn: sel.endColumn,
      };
    };

    disposables.push(
      editor.addAction({
        id: "matrx.ai.sendSelectionToChat",
        label: "Send selection to AI chat",
        contextMenuGroupId: "ai",
        contextMenuOrder: 1.1,
        precondition: "editorHasSelection",
        run: () => {
          if (!conversationId) {
            notify?.({
              type: "error",
              text: "Open a chat conversation first to send selection",
            });
            return;
          }
          const captured = captureSelectionText();
          if (!captured) {
            notify?.({ type: "error", text: "No text selected" });
            return;
          }
          dispatch(
            setContextEntry({
              conversationId,
              key: editorSelectionKey(activeTab.id),
              value: {
                id: activeTab.id,
                path: activeTab.path,
                name: activeTab.name,
                language: activeTab.language,
                selection: {
                  startLine: captured.startLine,
                  startColumn: captured.startColumn,
                  endLine: captured.endLine,
                  endColumn: captured.endColumn,
                },
                text: captured.text,
                capturedAt: new Date().toISOString(),
              },
              type: "json",
              label: `Selection: ${activeTab.name} L${captured.startLine}\u2013${captured.endLine}`,
            }),
          );
          notify?.({
            type: "success",
            text: `Selection sent (${captured.text.length} chars from ${activeTab.name})`,
          });
        },
      }),
    );

    disposables.push(
      editor.addAction({
        id: "matrx.ai.sendFileToChat",
        label: "Send file to AI chat",
        contextMenuGroupId: "ai",
        contextMenuOrder: 1.2,
        run: () => {
          if (!conversationId) {
            notify?.({
              type: "error",
              text: "Open a chat conversation first to send the file",
            });
            return;
          }
          dispatch(
            setContextEntry({
              conversationId,
              key: editorTabKey(activeTab.id),
              value: {
                id: activeTab.id,
                path: activeTab.path,
                name: activeTab.name,
                language: activeTab.language,
                content: activeTab.content,
                pristineContent: activeTab.pristineContent,
                dirty: !!activeTab.dirty,
                remoteUpdatedAt: activeTab.remoteUpdatedAt,
              },
              type: "json",
              label: `Editor: ${activeTab.name}`,
            }),
          );
          notify?.({
            type: "success",
            text: `${activeTab.name} pinned to chat context`,
          });
        },
      }),
    );

    disposables.push(
      editor.addAction({
        id: "matrx.ai.askInFloatingWindow",
        label: "Ask AI in floating window\u2026",
        contextMenuGroupId: "ai",
        contextMenuOrder: 1.3,
        run: () => {
          // Floating window doesn't share the Code workspace's
          // conversationId — it spins up its own when the user picks an
          // agent. We just pre-load the agent so the user lands one click
          // away from typing.
          dispatch(
            openOverlay({
              overlayId: "agentRunWindow",
              data: {
                initialAgentId: defaultAgentId ?? null,
                initialSelectedConversationId: null,
              },
            }),
          );
          notify?.({
            type: "info",
            text: "Opened AI window. Pick an agent to continue.",
          });
        },
      }),
    );

    return () => {
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* monaco editor may already be disposed during route nav */
        }
      }
    };
  }, [
    editorRef,
    editorReadyTick,
    activeTab,
    conversationId,
    dispatch,
    notify,
    defaultAgentId,
  ]);
}
