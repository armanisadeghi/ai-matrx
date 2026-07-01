"use client";

/**
 * CodeOrDiffColumn — the code column (middle-right in the 4-column layout).
 *
 * Ports the visual language from `CodeEditorWindow`:
 *   1. `CodeEditorTabBar` at the top — VS Code-style tabs, one per open file.
 *   2. Action strip — language icon + file path on the left; edit/format/
 *      wrap/minimap/copy buttons on the right.
 *   3. Monaco (SmallCodeEditor) below, ALWAYS mounted at full container
 *      size. Review / Applying / Complete / Error render as absolutely-
 *      positioned overlays on top so the editor never unmounts.
 *   4. Footer — Apply/Discard for review state, Back for error state,
 *      status line otherwise.
 *
 * The caller owns all multi-file state (via `useCodeEditorWindowState`) and
 * threads it through as props. We render; we don't orchestrate.
 */

import React from "react";
import {
  Pencil,
  Eye,
  Copy,
  Check,
  WrapText,
  Map as MapIcon,
  Loader2,
  CheckCircle2,
  Zap
} from "lucide-react";
import dynamic from "next/dynamic";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CodeEditorTabBar } from "@/features/window-panels/windows/code/CodeEditorTabBar";
import { getLanguageIconNode } from "@/features/code-editor/components/code-block/LanguageDisplay";
import { ReviewStage } from "./ReviewStage";
import { ErrorPanel } from "./ErrorPanel";
import type { CodeEditorState } from "../../types";
import type { ParseResult } from "../../utils/parseCodeEdits";
import type { CodeFile } from "@/features/code-editor/multi-file-core/types";

// Monaco is heavy; dynamic-load client-only.
const SmallCodeEditor = dynamic(
  () =>
    import(
      "@/features/code-editor/components/code-block/SmallCodeEditor"
    ).then((m) => m.default),
  { ssr: false },
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface CodeOrDiffColumnProps {
  // Multi-file + tab state (from useCodeEditorWindowState)
  files: CodeFile[];
  openTabs: string[];
  activeTab: string | null;
  currentFile: CodeFile | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string, e: React.MouseEvent) => void;

  // Editor content
  onContentChange: (value: string | undefined) => void;
  editorWrapperRef: React.Ref<HTMLDivElement>;
  editorHeight: string | undefined;
  editorPath: string | undefined;
  monacoLanguage: string;

  // Toolbar state
  isEditing: boolean;
  onToggleEditing: () => void;
  showWrapLines: boolean;
  onToggleWordWrap: () => void;
  minimapEnabled: boolean;
  onToggleMinimap: () => void;
  formatTrigger: number;
  onFormat: () => void;
  isCopied: boolean;
  onCopy: () => void;

  // State-machine controls (from useSmartCodeEditor)
  state: CodeEditorState;
  parsedEdits: ParseResult | null;
  modifiedCode: string;
  rawAIResponse: string;
  errorMessage: string;
  reviewIsCopied: boolean;
  diffStats: { additions: number; deletions: number } | null;
  onApply: () => void | Promise<void>;
  onDiscard: () => void;
  onCopyResponse: () => void | Promise<void>;
  onBackToInput: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodeOrDiffColumn({
  files,
  openTabs,
  activeTab,
  currentFile,
  onTabClick,
  onTabClose,
  onContentChange,
  editorWrapperRef,
  editorHeight,
  editorPath,
  monacoLanguage,
  isEditing,
  onToggleEditing,
  showWrapLines,
  onToggleWordWrap,
  minimapEnabled,
  onToggleMinimap,
  formatTrigger,
  onFormat,
  isCopied,
  onCopy,
  state,
  parsedEdits,
  modifiedCode,
  rawAIResponse,
  errorMessage,
  reviewIsCopied,
  diffStats,
  onApply,
  onDiscard,
  onCopyResponse,
  onBackToInput,
}: CodeOrDiffColumnProps) {
  const mode = useThemeMode();

  return (
    <div className="flex flex-col h-full min-h-0 bg-background overflow-hidden">
      {/* Tab bar — only shown when there are open tabs */}
      <CodeEditorTabBar
        openTabs={openTabs}
        activeTab={activeTab}
        files={files}
        onTabClick={onTabClick}
        onTabClose={onTabClose}
      />

      {/* Action strip — language icon + path on left, buttons on right */}
      {currentFile && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 shrink-0 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span className="shrink-0">
              {getLanguageIconNode(
                currentFile.language,
                false,
                currentFile.icon,
              )}
            </span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate font-mono">
              {currentFile.path}
            </span>
            {state === "processing" && (
              <span className="ml-2 flex items-center gap-1 text-[10px] text-muted-foreground italic shrink-0">
                <Zap className="w-3 h-3 animate-pulse" />
                Agent working…
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <ActionBtn
              onClick={onToggleEditing}
              active={isEditing}
              title={isEditing ? "Switch to read-only" : "Edit file"}
              disabled={state !== "input"}
            >
              {isEditing ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <Pencil className="w-3.5 h-3.5" />
              )}
            </ActionBtn>

            <ActionBtn
              onClick={onFormat}
              disabled={!isEditing || state !== "input"}
              title="Format document"
            >
              <Zap className="w-3.5 h-3.5" />
            </ActionBtn>

            <span className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5" />

            <ActionBtn
              onClick={onToggleWordWrap}
              active={showWrapLines}
              title={
                showWrapLines ? "Disable word wrap" : "Enable word wrap"
              }
            >
              <WrapText className="w-3.5 h-3.5" />
            </ActionBtn>

            <ActionBtn
              onClick={onToggleMinimap}
              active={minimapEnabled}
              title={minimapEnabled ? "Hide minimap" : "Show minimap"}
            >
              <MapIcon className="w-3.5 h-3.5" />
            </ActionBtn>

            <span className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5" />

            <ActionBtn onClick={onCopy} title="Copy file contents">
              {isCopied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </ActionBtn>
          </div>
        </div>
      )}

      {/* Body — Monaco stays mounted; overlays sit on top */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        <div ref={editorWrapperRef} className="flex-1 min-h-0">
          {currentFile ? (
            <SmallCodeEditor
              path={editorPath}
              language={monacoLanguage}
              initialCode={currentFile.content}
              onChange={onContentChange}
              mode={mode}
              height={editorHeight}
              readOnly={
                !isEditing || currentFile.readOnly || state !== "input"
              }
              formatTrigger={formatTrigger}
              controlledWordWrap={showWrapLines ? "on" : "off"}
              controlledMinimap={minimapEnabled}
              showFormatButton={false}
              showCopyButton={false}
              showResetButton={false}
              showWordWrapToggle={false}
              showMinimapToggle={false}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              No file open
            </div>
          )}
        </div>

        {state === "review" && parsedEdits && (
          <div className="absolute inset-0 bg-background">
            <ReviewStage
              currentCode={currentFile?.content ?? ""}
              modifiedCode={modifiedCode}
              language={monacoLanguage}
              parsedEdits={parsedEdits}
              rawAIResponse={rawAIResponse}
              diffStats={diffStats}
            />
          </div>
        )}

        {state === "applying" && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">Applying changes…</p>
            </div>
          </div>
        )}

        {state === "complete" && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium">Changes applied</p>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="absolute inset-0 bg-background">
            <ErrorPanel
              errorMessage={errorMessage}
              rawAIResponse={rawAIResponse}
              isCopied={reviewIsCopied}
              onCopyResponse={onCopyResponse}
            />
          </div>
        )}
      </div>

      {/* Footer — state-dependent action row */}
      <div className="shrink-0 border-t border-border px-2 py-2 flex items-center justify-end gap-1.5 bg-background">
        {state === "review" ? (
          <>
            <Button variant="ghost" size="sm" onClick={onDiscard}>
              Discard
            </Button>
            <Button
              size="sm"
              onClick={onApply}
              className="bg-green-600 hover:bg-green-700 text-white gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Apply
            </Button>
          </>
        ) : state === "error" ? (
          <Button size="sm" onClick={onBackToInput}>
            Back
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {currentFile?.content.length ?? 0} chars ·{" "}
            {currentFile?.content.split("\n").length ?? 0} lines
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center w-6 h-6 rounded transition-colors",
        active
          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
          : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200",
        disabled && "opacity-35 cursor-not-allowed pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}
