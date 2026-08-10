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
 * Monaco IDE actions (Format Document, Find, Go to Line, Command Palette, …)
 * are injected via `extraSections` (`createCodeEditorExtraSections`) so they
 * sit next to Cut/Copy/Paste without forking the unified menu.
 */

import React, { useEffect, useState, type MutableRefObject } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { formatEditorSurroundContext } from "@/utils/format-editor-surround-context";
import { selectActiveTab, selectCodeTabs } from "../redux/tabsSlice";
import {
  selectActiveFilesystemId,
  selectActiveFilesystemLabel,
  selectActiveFilesystemRoot,
} from "../redux/codeWorkspaceSlice";
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
import { createCodeEditorExtraSections } from "./codeEditorExtraSections";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

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
  const filesystemId = useAppSelector(selectActiveFilesystemId);
  const filesystemLabel = useAppSelector(selectActiveFilesystemLabel);
  const filesystemRoot = useAppSelector(selectActiveFilesystemRoot);

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
  const { openFilePaths, modifiedFilePaths, openFiles } =
    summarizeOpenTabs(tabs);

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
      openFiles,
      workspaceRoot: filesystemRoot ?? undefined,
      filesystemId: filesystemId ?? undefined,
      filesystemLabel: filesystemLabel ?? undefined,
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

  const editorExtraSections = createCodeEditorExtraSections({
    getEditor: () => editorRef.current,
    hasSelection: selectedText.length > 0,
  });

  // Surface write handlers — one per declared `writeTargets` entry on the
  // code-editor manifest. Every one validates and THROWS on a bad shape or on
  // a state it cannot honour (no editor, no selection, no open file); the
  // writeback seam turns throws into safe error envelopes the agent reads.
  // All three reuse the SAME `executeEdits` paths the right-click AI actions
  // above use, so an agent edit joins Monaco's undo stack exactly like the
  // user's own — nothing is written to disk, the tab just goes modified.
  const getSurfaceWriteHandlers = () => ({
    replace_selection: (value: unknown) => {
      if (typeof value !== "string" || !value.length)
        throw new Error("replace_selection expects a non-empty code string.");
      const ed = editorRef.current;
      if (!ed)
        throw new Error(
          "The code editor is not mounted, so there is nothing to write into.",
        );
      const sel = ed.getSelection();
      if (!sel || sel.isEmpty())
        throw new Error(
          "replace_selection needs a selection, and nothing is selected. Ask the user to highlight the code to replace, or use insert_at_cursor / current_file_content instead.",
        );
      handleTextReplace(value);
    },
    insert_at_cursor: (value: unknown) => {
      if (typeof value !== "string" || !value.length)
        throw new Error("insert_at_cursor expects a non-empty code string.");
      const ed = editorRef.current;
      if (!ed)
        throw new Error(
          "The code editor is not mounted, so there is nothing to write into.",
        );
      const sel = ed.getSelection();
      // With a selection, land AFTER it (never clobber what the user picked);
      // with none, land at the caret.
      if (sel && !sel.isEmpty()) handleTextInsertAfter(value);
      else handleTextInsertBefore(value);
    },
    current_file_content: (value: unknown) => {
      if (typeof value !== "string" || !value.trim())
        throw new Error(
          "current_file_content expects a non-empty file body. Emptying a file is a human action.",
        );
      const ed = editorRef.current;
      const model = ed?.getModel();
      if (!ed || !model)
        throw new Error(
          "No file is open in the code editor, so there is no buffer to replace.",
        );
      // One edit over the full range, NOT `model.setValue()` — setValue would
      // discard the user's undo history, and the whole safety story here is
      // that ⌘Z reverses an agent rewrite. The range is derived from the
      // methods `MonacoModel` already declares rather than widening that
      // narrowed type for one call.
      const lastLine = model.getLineCount();
      ed.executeEdits("agent-replace-file", [
        {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: lastLine,
            endColumn: model.getLineContent(lastLine).length + 1,
          },
          text: value,
          forceMoveMarkers: true,
        },
      ]);
      ed.focus();
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={CODE_WORKSPACE_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getApplicationScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <div className={className}>
        <EditableContextMenu
          {...CODE_WORKSPACE_CONTEXT_MENU_PROPS}
          contextData={getContextData()}
          getApplicationScope={getApplicationScope}
          extraSections={editorExtraSections}
          onTextReplace={handleTextReplace}
          onTextInsertBefore={handleTextInsertBefore}
          onTextInsertAfter={handleTextInsertAfter}
        >
          {children}
        </EditableContextMenu>
      </div>
    </SurfaceRuntimeProvider>
  );
}
