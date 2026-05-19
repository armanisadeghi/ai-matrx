"use client";

/**
 * CodeWorkspaceContextMenu — wires the new `(a)/code` workspace's editor
 * surface to `UnifiedAgentContextMenu` so right-click delivers agent
 * shortcuts (filtered by `code-editor` context).
 *
 * NOTE: this wrapper deliberately does NOT register Monaco's IDE actions
 * (Format Document, Go to Definition, etc.) inside the Radix menu — the
 * unified menu's internal layout doesn't expose an extension point yet.
 * Users access those via Monaco's command palette (`F1` /
 * `Cmd+Shift+P`). Adding an "Editor Actions" group is a follow-up task
 * tracked in `phase-21-code-workspace-resource-pills.md`.
 */

import React, { useCallback, useEffect, useState, type MutableRefObject } from "react";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveTab } from "../redux/tabsSlice";
import {
  selectAllDiagnostics,
  selectDiagnosticsByTabId,
} from "../redux/diagnosticsSlice";
import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import type { StandaloneCodeEditor } from "../editor/MonacoEditor";

const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2").then((mod) => ({
      default: mod.UnifiedAgentContextMenu,
    })),
  { ssr: false },
);

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
 * Right-click wrapper for the Monaco surface. Tracks selection live and
 * passes a `vsc_*` keyset through to UnifiedAgentContextMenu so Shortcuts
 * can bind against the live editor state.
 */
export function CodeWorkspaceContextMenu({
  children,
  editorRef,
  editorReadyTick,
  className,
}: CodeWorkspaceContextMenuProps) {
  const activeTab = useAppSelector(selectActiveTab);
  const allDiagnostics = useAppSelector(selectAllDiagnostics);
  const activeTabDiagnostics = useAppSelector((state) =>
    selectDiagnosticsByTabId(state, activeTab?.id ?? null),
  );

  const [selectedText, setSelectedText] = useState("");

  // Track selection live so the right-click menu can surface "selection-only"
  // shortcuts (or hide them when nothing is selected).
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;

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

  // Build the live `vsc_*` scope keyset for shortcuts. Re-derives on every
  // call because Monaco model state can change at any time.
  const getContextData = useCallback(() => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    const position = ed?.getPosition();

    const fullContent = ed?.getValue() ?? activeTab?.content ?? "";
    const language = activeTab?.language ?? model?.getLanguageId() ?? "plaintext";
    const filePath =
      activeTab?.path ?? model?.uri.path ?? activeTab?.name ?? "untitled";

    return {
      // Default scopes consumed by the shortcut runner
      content: fullContent,
      selection: selectedText,
      contextFilter: "code-editor",

      // `vsc_*` UI-context contract (see features/code/FEATURE.md)
      vsc_active_file_path: filePath,
      vsc_active_file_content: fullContent,
      vsc_active_file_language: language,
      vsc_selected_text: selectedText,
      vsc_diagnostics: activeTabDiagnostics,
      vsc_all_diagnostics: allDiagnostics,
      vsc_current_line: position?.lineNumber ?? 0,
      vsc_current_column: position?.column ?? 0,
      vsc_line_count: model?.getLineCount() ?? 0,
      vsc_has_selection: selectedText.length > 0,
    };
  }, [activeTab, activeTabDiagnostics, allDiagnostics, editorRef, selectedText]);

  return (
    <div className={className}>
      <UnifiedAgentContextMenu
        sourceFeature="code-editor"
        surfaceName="matrx-user/code-editor"
        isEditable={false}
        enabledPlacements={[
          PLACEMENT_TYPES.AI_ACTION,
          PLACEMENT_TYPES.ORGANIZATION_TOOL,
          PLACEMENT_TYPES.USER_TOOL,
        ]}
        contextData={getContextData()}
      >
        {children}
      </UnifiedAgentContextMenu>
    </div>
  );
}
