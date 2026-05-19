"use client";

/**
 * CodeEditorWindow
 *
 * Floating multi-file code editor window built on WindowPanel.
 *
 * Architecture:
 *  - WindowPanel provides: title bar, drag/resize, maximize/minimize, native
 *    resizable sidebar (file explorer), persistence to window_sessions.
 *  - CodeEditorTabBar: VS Code-style tab strip showing open files.
 *  - SmallCodeEditor: Monaco editor using multi-model paths (no remount on tab switch).
 *  - useCodeEditorWindowState: all tab + editor state — no dependency on
 *    the standalone MultiFileCodeEditor's hook.
 *
 * Opening the window:
 *   dispatch(openOverlay({
 *     overlayId: "codeEditorWindow",
 *     instanceId: `code-editor-${Date.now()}`,
 *     data: {
 *       files: [{ name: "index.ts", path: "index.ts", language: "typescript", content: "..." }],
 *       title: "My Editor",
 *     },
 *   }))
 */

import React, { useCallback } from "react";
import {
  Pencil,
  Eye,
  Copy,
  Check,
  WrapText,
  Map,
  AlignLeft,
  Zap,
  FolderOpen,
  Save,
  Loader2,
  AlertCircle,
  CircleDot
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import CodeSidebar from "@/features/code-editor/multi-file-core/CodeSidebar";
import SmallCodeEditor from "@/features/code-editor/components/code-block/SmallCodeEditor";
import { getLanguageIconNode } from "@/features/code-editor/components/code-block/LanguageDisplay";
import { CodeEditorTabBar } from "./CodeEditorTabBar";
import { useCodeEditorWindowState } from "./useCodeEditorWindowState";
import type { CodeFile } from "@/features/code-editor/multi-file-core/types";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CodeEditorWindowProps {
  windowInstanceId: string;
  /** In-memory files (legacy/session mode). Ignored when `fileIds` is set. */
  files: CodeFile[];
  /**
   * Persisted mode: ids of code_files rows to load and edit. When provided,
   * the window pulls content from Redux, routes edits through the auto-save
   * middleware, and displays a "Saving…" indicator.
   */
  fileIds?: string[];
  /** Tab to show active on open. In persisted mode this is a fileId. */
  activeFileId?: string;
  title?: string | null;
  defaultWordWrap?: "on" | "off";
  autoFormatOnOpen?: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodeEditorWindow({
  windowInstanceId,
  files: initialFiles,
  fileIds,
  activeFileId,
  title,
  defaultWordWrap = "off",
  autoFormatOnOpen = false,
  onClose,
}: CodeEditorWindowProps) {
  const mode = useAppSelector((s) => s.theme.mode);

  const {
    files,
    currentFile,
    openTabs,
    activeTab,
    openFile,
    closeTab,
    selectTab,
    isEditing,
    setIsEditing,
    showWrapLines,
    setShowWrapLines,
    minimapEnabled,
    setMinimapEnabled,
    lineNumbers,
    formatTrigger,
    isCopied,
    handleContentChange,
    handleCopy,
    handleFormat,
    handleSaveNow,
    getEditorPath,
    mapLanguageForMonaco,
    editorWrapperRef,
    editorHeight,
    isPersisted,
    isDirty,
    isSaving,
    saveError,
  } = useCodeEditorWindowState({
    initialFiles,
    fileIds,
    initialActiveFile: activeFileId ?? null,
  });

  // ── Persistence collect ────────────────────────────────────────────────────
  // In persisted mode the file contents live in Redux / the DB; we only
  // persist the list of ids + active tab so the window re-hydrates on reload.
  const collectData = useCallback(
    (): Record<string, unknown> =>
      isPersisted
        ? {
            fileIds: fileIds ?? [],
            activeFileId: activeTab,
            title: title ?? null,
          }
        : {
            files,
            activeFile: activeTab,
            title: title ?? null,
          },
    [isPersisted, fileIds, files, activeTab, title],
  );

  // ── Derived editor props ───────────────────────────────────────────────────
  const editorPath = currentFile ? getEditorPath(currentFile) : undefined;
  const monacoLanguage = currentFile
    ? mapLanguageForMonaco(currentFile.language)
    : "plaintext";

  return (
    <WindowPanel
      id={`code-editor-window-${windowInstanceId}`}
      title={title ?? "Code Editor"}
      overlayId="codeEditorWindow"
      minWidth={560}
      minHeight={360}
      width={1060}
      height={680}
      position="center"
      onClose={onClose}
      onCollectData={collectData}
      sidebar={
        <CodeSidebar
          files={files}
          activeFile={activeTab ?? ""}
          handleFileSelect={openFile}
          // No fixed sidebarWidth — WindowPanel's resizable panel controls it.
          className="border-r-0 w-full"
        />
      }
      sidebarDefaultSize={200}
      sidebarMinSize={140}
      sidebarExpandsWindow
      defaultSidebarOpen={true}
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <CodeEditorTabBar
          openTabs={openTabs}
          activeTab={activeTab}
          files={files}
          onTabClick={selectTab}
          onTabClose={closeTab}
        />

        {currentFile ? (
          <>
            {/* ── Action strip ──────────────────────────────────────── */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 shrink-0 gap-2">
              {/* Left: language icon + file path */}
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
              </div>

              {/* Right: action buttons */}
              <div className="flex items-center gap-0.5 shrink-0">
                {/* Save status (persisted mode only) */}
                {isPersisted ? (
                  <SaveStatusIndicator
                    dirty={isDirty}
                    saving={isSaving}
                    error={saveError}
                    onSave={handleSaveNow}
                  />
                ) : null}

                {/* Edit / View toggle */}
                <ActionBtn
                  onClick={() => setIsEditing(!isEditing)}
                  active={isEditing}
                  title={isEditing ? "Switch to read-only" : "Edit file"}
                >
                  {isEditing ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5" />
                  )}
                </ActionBtn>

                {/* Format (only useful when editing) */}
                <ActionBtn
                  onClick={handleFormat}
                  disabled={!isEditing}
                  title="Format document"
                >
                  <Zap className="w-3.5 h-3.5" />
                </ActionBtn>

                {/* Divider */}
                <span className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5" />

                {/* Word wrap */}
                <ActionBtn
                  onClick={() => setShowWrapLines(!showWrapLines)}
                  active={showWrapLines}
                  title={
                    showWrapLines ? "Disable word wrap" : "Enable word wrap"
                  }
                >
                  <WrapText className="w-3.5 h-3.5" />
                </ActionBtn>

                {/* Minimap */}
                <ActionBtn
                  onClick={() => setMinimapEnabled(!minimapEnabled)}
                  active={minimapEnabled}
                  title={minimapEnabled ? "Hide minimap" : "Show minimap"}
                >
                  <Map className="w-3.5 h-3.5" />
                </ActionBtn>

                {/* Divider */}
                <span className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5" />

                {/* Copy */}
                <ActionBtn onClick={handleCopy} title="Copy file contents">
                  {isCopied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </ActionBtn>
              </div>
            </div>

            {/* ── Monaco editor ─────────────────────────────────────── */}
            <div ref={editorWrapperRef} className="flex-1 min-h-0">
              <SmallCodeEditor
                path={editorPath}
                language={monacoLanguage}
                initialCode={currentFile.content}
                onChange={handleContentChange}
                mode={mode}
                autoFormat={autoFormatOnOpen}
                defaultWordWrap={defaultWordWrap}
                height={editorHeight}
                readOnly={!isEditing || currentFile.readOnly}
                formatTrigger={formatTrigger}
                controlledWordWrap={showWrapLines ? "on" : "off"}
                controlledMinimap={minimapEnabled}
                showFormatButton={false}
                showCopyButton={false}
                showResetButton={false}
                showWordWrapToggle={false}
                showMinimapToggle={false}
              />
            </div>
          </>
        ) : (
          /* ── Empty state ────────────────────────────────────────────── */
          <EmptyState files={files} onOpenFile={openFile} />
        )}
      </div>
    </WindowPanel>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  files,
  onOpenFile,
}: {
  files: CodeFile[];
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 py-8">
      <FolderOpen className="w-10 h-10 text-gray-300 dark:text-gray-600" />
      {files.length > 0 ? (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select a file from the sidebar to open it
          </p>
          <div className="flex flex-col gap-1.5 w-full max-w-xs mt-2">
            {files.map((f) => (
              <button
                key={f.path}
                onClick={() => onOpenFile(f.path)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-left rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              >
                {getLanguageIconNode(f.language, true, f.icon)}
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No files loaded. Open the window with{" "}
          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            data&#58; &#123; files: [...] &#125;
          </code>
        </p>
      )}
    </div>
  );
}

// ─── Save status indicator ────────────────────────────────────────────────────

function SaveStatusIndicator({
  dirty,
  saving,
  error,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
}) {
  if (error) {
    return (
      <button
        type="button"
        onClick={onSave}
        title={`Save failed: ${error}. Click to retry.`}
        className="flex items-center gap-1 px-1.5 h-6 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px]"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        Error
      </button>
    );
  }
  if (saving) {
    return (
      <span className="flex items-center gap-1 px-1.5 h-6 text-[11px] text-gray-500 dark:text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <button
        type="button"
        onClick={onSave}
        title="Save now"
        className="flex items-center gap-1 px-1.5 h-6 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[11px]"
      >
        <CircleDot className="w-3 h-3" />
        Unsaved
      </button>
    );
  }
  return (
    <span
      className="flex items-center gap-1 px-1.5 h-6 text-[11px] text-emerald-600 dark:text-emerald-400"
      title="Saved"
    >
      <Save className="w-3 h-3" />
      Saved
    </span>
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

export default CodeEditorWindow;
