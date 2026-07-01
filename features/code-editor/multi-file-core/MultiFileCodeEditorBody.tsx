"use client";

/**
 * MultiFileCodeEditorBody
 *
 * The pure editor area: file-name header + Monaco editor, no sidebar.
 * Accepts all state and callbacks from `useCodeEditorBasics` as props.
 *
 * Use in two modes:
 *  - Standalone wrapper (`MultiFileCodeEditor`): pass `onToggleSidebar` to
 *    show the sidebar-toggle button in the header.
 *  - Window panel (`CodeEditorWindow`): omit `onToggleSidebar`; WindowPanel
 *    provides its own sidebar toggle.
 */

import React from "react";
import SmallCodeEditor from "@/features/code-editor/components/code-block/SmallCodeEditor";
import CodeBlockHeader from "@/features/code-editor/components/code-block/CodeBlockHeader";
import { getLanguageIconNode } from "@/features/code-editor/components/code-block/LanguageDisplay";
import { PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CodeFile } from "./types";

export interface MultiFileCodeEditorBodyProps {
  // ── Current file ────────────────────────────────────────────────────────────
  currentFile: CodeFile;
  code: string;
  monacoLanguage: string;
  monacoFileExtension?: string;
  editorPath: string;

  // ── UI state ────────────────────────────────────────────────────────────────
  isEditing: boolean;
  isFullScreen: boolean;
  isCollapsed: boolean;
  isCopied: boolean;
  lineNumbers: boolean;
  showWrapLines: boolean;
  minimapEnabled: boolean;
  isCreatingPage: boolean;
  formatTrigger: number;

  // ── Callbacks ───────────────────────────────────────────────────────────────
  handleContentChange: (content: string | undefined) => void;
  handleCopy: (e: React.MouseEvent, withLineNumbers?: boolean) => void;
  handleDownload: (e: React.MouseEvent) => void;
  toggleEdit: (e: React.MouseEvent) => void;
  toggleFullScreen: (e: React.MouseEvent) => void;
  toggleCollapse: (e?: React.MouseEvent) => void;
  toggleLineNumbers: (e: React.MouseEvent) => void;
  toggleWrapLines: (e: React.MouseEvent) => void;
  handleFormat: (e: React.MouseEvent) => void;
  handleReset: (e: React.MouseEvent) => void;
  toggleMinimap: (e: React.MouseEvent) => void;
  handleViewHTML: () => void;
  isCompleteHTMLDocument: (html: string) => boolean;

  // ── Sidebar toggle (standalone mode only) ───────────────────────────────────
  /** When provided, a sidebar-toggle button appears in the header. */
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;

  // ── Editor config ───────────────────────────────────────────────────────────
  runCode?: () => void;
  autoFormatOnOpen?: boolean;
  defaultWordWrap?: "on" | "off";

  // ── Height / measure ref ────────────────────────────────────────────────────
  /** Ref attached to the Monaco wrapper div for height measurement. */
  editorWrapperRef: (node: HTMLDivElement | null) => void;
  /** Explicit height string passed to Monaco (e.g. "480px"). */
  editorHeight?: string;
}

export function MultiFileCodeEditorBody({
  currentFile,
  code,
  monacoLanguage,
  monacoFileExtension,
  editorPath,
  isEditing,
  isFullScreen,
  isCollapsed,
  isCopied,
  lineNumbers,
  showWrapLines,
  minimapEnabled,
  isCreatingPage,
  formatTrigger,
  handleContentChange,
  handleCopy,
  handleDownload,
  toggleEdit,
  toggleFullScreen,
  toggleCollapse,
  toggleLineNumbers,
  toggleWrapLines,
  handleFormat,
  handleReset,
  toggleMinimap,
  handleViewHTML,
  isCompleteHTMLDocument,
  sidebarVisible,
  onToggleSidebar,
  runCode,
  autoFormatOnOpen = false,
  defaultWordWrap = "off",
  editorWrapperRef,
  editorHeight,
}: MultiFileCodeEditorBodyProps) {
  const mode = useThemeMode();
  const isMobile = useIsMobile();

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col">
      {/* ── Header: sidebar toggle · file name · code controls ──────────── */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 flex-shrink-0">
        {/* Left: optional sidebar toggle + language icon + file name */}
        <div className="flex items-center gap-2 min-w-0">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSidebar}
              className="h-6 w-6 p-0 flex-shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700"
              title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          )}
          {getLanguageIconNode(currentFile.language, false, currentFile.icon)}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {currentFile.name}
          </span>
        </div>

        {/* Right: all code-block controls (copy, download, edit, fullscreen…) */}
        <div className="flex-shrink-0">
          <CodeBlockHeader
            language={currentFile.language}
            linesCount={code.split("\n").length}
            isEditing={isEditing}
            isFullScreen={isFullScreen}
            isCollapsed={isCollapsed}
            code={code}
            handleCopy={handleCopy}
            handleDownload={handleDownload}
            toggleEdit={toggleEdit}
            toggleFullScreen={toggleFullScreen}
            toggleCollapse={toggleCollapse}
            toggleLineNumbers={toggleLineNumbers}
            toggleWrapLines={toggleWrapLines}
            isCopied={isCopied}
            isMobile={isMobile}
            isCompleteHTML={isCompleteHTMLDocument(code)}
            handleViewHTML={handleViewHTML}
            isCreatingPage={isCreatingPage}
            showWrapLines={showWrapLines}
            handleFormat={handleFormat}
            handleReset={handleReset}
            minimapEnabled={minimapEnabled}
            toggleMinimap={toggleMinimap}
            showLineNumbers={lineNumbers}
            hideLanguageDisplay={true}
          />
        </div>
      </div>

      {/* ── Monaco editor ────────────────────────────────────────────────── */}
      <div ref={editorWrapperRef} className="flex-1 min-h-0">
        <SmallCodeEditor
          path={editorPath}
          language={monacoLanguage}
          fileExtension={monacoFileExtension}
          initialCode={currentFile.content}
          onChange={handleContentChange}
          runCode={runCode}
          mode={mode}
          autoFormat={autoFormatOnOpen}
          defaultWordWrap={defaultWordWrap}
          showFormatButton={false}
          showCopyButton={false}
          showResetButton={false}
          showWordWrapToggle={false}
          showMinimapToggle={false}
          height={editorHeight}
          readOnly={!isEditing || currentFile.readOnly}
          formatTrigger={formatTrigger}
          controlledWordWrap={showWrapLines ? "on" : "off"}
          controlledMinimap={minimapEnabled}
        />
      </div>
    </div>
  );
}
