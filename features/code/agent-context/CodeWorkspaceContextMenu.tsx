"use client";

/**
 * CodeWorkspaceContextMenu — wires the `(a)/code` workspace's editable Monaco
 * surface to the universal v3 `EditableContextMenu` so right-click delivers
 * agent shortcuts + bound agents (filtered by the `code-editor` context) AND
 * can write their output straight back into the buffer.
 *
 * Editable region of the surface: this wrapper uses the editable wrapper and
 * wires `onTextReplace` / `onTextInsertBefore` / `onTextInsertAfter` through
 * Monaco's `executeEdits`, so an agent action that returns replacement text
 * applies in place (read-only diff/preview regions use `CodeReadonlyContextMenu`
 * instead).
 *
 * NOTE: this wrapper deliberately does NOT register Monaco's IDE actions
 * (Format Document, Go to Definition, etc.) inside the Radix menu — the
 * unified menu's internal layout doesn't expose an extension point yet.
 * Users access those via Monaco's command palette (`F1` / `Cmd+Shift+P`).
 */

import React, { useEffect, useState, type MutableRefObject } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { formatEditorSurroundContext } from "@/utils/format-editor-surround-context";
import { selectActiveTab, selectCodeTabs } from "../redux/tabsSlice";
import {
  selectAllDiagnostics,
  selectDiagnosticsByTabId,
} from "../redux/diagnosticsSlice";
import type { StandaloneCodeEditor } from "../editor/MonacoEditor";
import {
  buildCodeWorkspaceContextData,
  codeEditorLaunchScope,
  CODE_WORKSPACE_CONTEXT_MENU_PROPS,
  summarizeOpenTabs,
  type CodeSelectionRange,
} from "./buildCodeWorkspaceContextData";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";

interface CodeWorkspaceContextMenuProps {
  children: React.ReactNode;
  editorRef: MutableRefObject<StandaloneCodeEditor | null>;
  /**
   * Bump-counter incremented on Monaco mount — re-runs the selection-tracking
   * effect once the editor instance is actually attached.
   */
  editorReadyTick: number;
  className?: string;
}

/**
 * Right-click wrapper for the editable Monaco surface. Tracks selection live
 * and assembles the canonical `matrx-user/code-editor` scope (baselines +
 * declared SurfaceValues + the `vsc_*` contract) at click time so Shortcuts
 * and bound agents bind against the live editor state.
 */
export function CodeWorkspaceContextMenu({
  children,
  editorRef,
  editorReadyTick,
  className,
}: CodeWorkspaceContextMenuProps) {
  const activeTab = useAppSelector(selectActiveTab);
  const tabs = useAppSelector(selectCodeTabs);
  const allDiagnostics = useAppSelector(selectAllDiagnostics);
  const activeTabDiagnostics = useAppSelector((state) =>
    selectDiagnosticsByTabId(state, activeTab?.id ?? null),
  );

  const [selectedText, setSelectedText] = useState("");

  // Track selection live so the right-click menu can surface "selection-only"
  // shortcuts (or hide them when nothing is selected).
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return undefined;

    const sync = () => {
      const sel = ed.getSelection();
      if (!sel || sel.isEmpty()) {
        setSelectedText("");
        return;
      }
      const model = ed.getModel();
      if (!model) {
        setSelectedText("");
        return;
      }
      setSelectedText(model.getValueInRange(sel));
    };

    sync();
    const disposable = ed.onDidChangeCursorSelection(sync);
    return () => disposable.dispose();
  }, [editorRef, editorReadyTick]);

  // Open editable tabs (Monaco-backed; preview tabs have no buffer).
  const { openFilePaths, modifiedFilePaths } = summarizeOpenTabs(tabs);

  // Build the live scope keyset. Re-derived on every call because Monaco model
  // state can change at any time — never cached in render-triggering state.
  const getContextData = (): Record<string, unknown> => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    const position = ed?.getPosition();
    const sel = ed?.getSelection();

    const fullContent = ed?.getValue() ?? activeTab?.content ?? "";
    const language =
      activeTab?.language ?? model?.getLanguageId() ?? "plaintext";
    const filePath =
      activeTab?.path ?? model?.uri.path ?? activeTab?.name ?? "untitled";

    let textBefore = "";
    let textAfter = "";
    let selectionRange: CodeSelectionRange | null = null;
    let surroundContext: string | undefined;
    if (model && sel) {
      const selStartOffset = model.getOffsetAt({
        lineNumber: sel.startLineNumber,
        column: sel.startColumn,
      });
      const selEndOffset = model.getOffsetAt({
        lineNumber: sel.endLineNumber,
        column: sel.endColumn,
      });
      textBefore = fullContent.slice(
        Math.max(0, selStartOffset - 500),
        selStartOffset,
      );
      textAfter = fullContent.slice(selEndOffset, selEndOffset + 500);
      surroundContext = formatEditorSurroundContext(fullContent, {
        selectionStart: selStartOffset,
        selectionEnd: selEndOffset,
      });
      if (!sel.isEmpty()) {
        selectionRange = {
          startLine: sel.startLineNumber,
          startColumn: sel.startColumn,
          endLine: sel.endLineNumber,
          endColumn: sel.endColumn,
        };
      }
    }

    return buildCodeWorkspaceContextData({
      fullContent,
      selectedText,
      language,
      filePath,
      currentLine: position?.lineNumber ?? 0,
      currentColumn: position?.column ?? 0,
      lineCount: model?.getLineCount() ?? 0,
      activeTabDiagnostics,
      allDiagnostics,
      isModified: !!activeTab?.dirty,
      textBefore,
      textAfter,
      selectionRange,
      openFilePaths,
      modifiedFilePaths,
      surroundContext,
    });
  };

  // Apply an agent's replacement text over the live selection.
  const handleTextReplace = (newText: string) => {
    const ed = editorRef.current;
    const sel = ed?.getSelection();
    if (!ed || !sel) return;
    ed.executeEdits("ai-replace", [
      { range: sel, text: newText, forceMoveMarkers: true },
    ]);
    ed.focus();
  };

  const handleTextInsertBefore = (text: string) => {
    const ed = editorRef.current;
    const position = ed?.getPosition();
    if (!ed || !position) return;
    ed.executeEdits("ai-insert-before", [
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        text,
        forceMoveMarkers: true,
      },
    ]);
    ed.focus();
  };

  const handleTextInsertAfter = (text: string) => {
    const ed = editorRef.current;
    const sel = ed?.getSelection();
    if (!ed || !sel) return;
    ed.executeEdits("ai-insert-after", [
      {
        range: {
          startLineNumber: sel.endLineNumber,
          startColumn: sel.endColumn,
          endLineNumber: sel.endLineNumber,
          endColumn: sel.endColumn,
        },
        text,
        forceMoveMarkers: true,
      },
    ]);
    ed.focus();
  };

  // `getContextData()` already produces a complete, live scope (baselines +
  // declared SurfaceValues + `vsc_*`); `codeEditorLaunchScope` drops the
  // menu-only `contextFilter` key before it reaches the agent.
  const getApplicationScope = (): ApplicationScope =>
    codeEditorLaunchScope(getContextData()) as ApplicationScope;

  return (
    <div className={className}>
      <EditableContextMenu
        {...CODE_WORKSPACE_CONTEXT_MENU_PROPS}
        contextData={getContextData()}
        getApplicationScope={getApplicationScope}
        onTextReplace={handleTextReplace}
        onTextInsertBefore={handleTextInsertBefore}
        onTextInsertAfter={handleTextInsertAfter}
      >
        {children}
      </EditableContextMenu>
    </div>
  );
}
