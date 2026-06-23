"use client";

/**
 * CodeReadonlyContextMenu — the PRESENTATIONAL half of the
 * `matrx-user/code-editor` surface. Wraps the read-only regions a user
 * *reads* rather than edits (the agent SEARCH/REPLACE diff `TabDiffView`, the
 * history `TripleDiffView`, the live `RenderPreviewView`) so right-click still
 * offers agent shortcuts + bound agents over the displayed code.
 *
 * Read-only by contract: `isEditable={false}` and NO text-replace callbacks.
 * It deliberately omits `getApplicationScope` so `UnifiedAgentContextMenu`
 * captures the user's live DOM text selection at launch (the diff text the
 * user highlighted) and floors `selection` / `text_before` / `text_after`
 * from it — while `contextData` still carries the active file's body + the
 * declared SurfaceValues so file-level bindings resolve.
 *
 * The editable Monaco region uses `CodeWorkspaceContextMenu` instead.
 */

import React from "react";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveTab, selectCodeTabs } from "../redux/tabsSlice";
import {
  selectAllDiagnostics,
  selectDiagnosticsByTabId,
} from "../redux/diagnosticsSlice";
import {
  buildCodeWorkspaceContextData,
  CODE_WORKSPACE_CONTEXT_MENU_PROPS,
  summarizeOpenTabs,
} from "./buildCodeWorkspaceContextData";

const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2").then((mod) => ({
      default: mod.UnifiedAgentContextMenu,
    })),
  { ssr: false },
);

interface CodeReadonlyContextMenuProps {
  children: React.ReactNode;
  className?: string;
}

export function CodeReadonlyContextMenu({
  children,
  className,
}: CodeReadonlyContextMenuProps) {
  const activeTab = useAppSelector(selectActiveTab);
  const tabs = useAppSelector(selectCodeTabs);
  const allDiagnostics = useAppSelector(selectAllDiagnostics);
  const activeTabDiagnostics = useAppSelector((state) =>
    selectDiagnosticsByTabId(state, activeTab?.id ?? null),
  );

  const { openFilePaths, modifiedFilePaths } = summarizeOpenTabs(tabs);

  const contextData = buildCodeWorkspaceContextData({
    fullContent: activeTab?.content ?? "",
    selectedText: "",
    language: activeTab?.language ?? "plaintext",
    filePath: activeTab?.path ?? activeTab?.name ?? "",
    currentLine: 0,
    currentColumn: 0,
    lineCount: activeTab?.content ? activeTab.content.split("\n").length : 0,
    activeTabDiagnostics,
    allDiagnostics,
    isModified: !!activeTab?.dirty,
    openFilePaths,
    modifiedFilePaths,
  });

  return (
    <div className={className}>
      <UnifiedAgentContextMenu
        {...CODE_WORKSPACE_CONTEXT_MENU_PROPS}
        isEditable={false}
        contextData={contextData}
      >
        {children}
      </UnifiedAgentContextMenu>
    </div>
  );
}
