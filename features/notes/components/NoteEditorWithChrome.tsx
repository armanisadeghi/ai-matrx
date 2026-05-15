"use client";

// NoteEditorWithChrome — The standard note editor with all the chrome.
//
// Wraps NoteEditorCore with:
// - Context menu (right-click: AI actions, copy/cut/paste, find/replace, cleanup, etc.)
// - Status bar (save state, word count, char count, last updated)
// - Voice input button
//
// Use this everywhere a note is editable. The bare NoteEditorCore is only
// for cases where you MUST control the context menu externally (e.g., the
// SSR workspace with its tab-aware context menu).
//
// Architecture:
//   NoteEditorCore  — editor surface only
//   NoteEditorWithChrome  — core + context menu + status bar (THIS FILE)
//   Parent components  — auto-save, tabs, metadata, conflict resolution

import React, { useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import {
  NoteEditorCore,
  type NoteEditorCoreProps,
  type EditorMode,
} from "./NoteEditorCore";

// ── Lazy-loaded context menu (heavy: AI, Redux, Gem, modals) ──────

const NoteContextMenu = dynamic(
  () => import("@/features/notes/components/NoteContextMenu"),
  { ssr: false },
);

// ── Types ────────────────────────────────────────────────────────────────

export interface NoteEditorChromeProps extends NoteEditorCoreProps {
  /** Note ID — required for context menu and version history */
  noteId: string;

  /** Whether there are unsaved changes (shows save indicator in context menu) */
  isDirty?: boolean;

  /** Save state for the status bar */
  saveState?: "saved" | "dirty" | "saving" | "conflict";

  /** Last updated timestamp for status bar */
  lastUpdatedAt?: string;

  /** All available folders for the "Move to Folder" context menu */
  allFolders?: string[];

  /** Current folder of this note */
  currentFolder?: string;

  // ── Optional callbacks (context menu + status bar) ──────────────────

  /** Called when user clicks "Save" in context menu */
  onSave?: () => void;
  /** Called when user clicks "Duplicate" */
  onDuplicate?: () => void;
  /** Called when user clicks "Export as Markdown" */
  onExport?: () => void;
  /** Called when user clicks "Share Link" */
  onShareLink?: () => void;
  /** Called when user clicks "Copy to Clipboard" */
  onShareClipboard?: () => void;
  /** Called when user moves note to a different folder */
  onMove?: (folder: string) => void;
  /** Called when user clicks "Close Tab" */
  onCloseTab?: () => void;
  /** Called when user clicks "Close Other Tabs" */
  onCloseOtherTabs?: () => void;
  /** Called when user clicks "Close All Tabs" */
  onCloseAllTabs?: () => void;
  /** Called when user clicks "Delete Note" */
  onDelete?: () => void;
  /** Called when user opens "Version History" */
  onVersionHistory?: () => void;

  // ── Chrome visibility options ──────────────────────────────────────

  /** Show the status bar at the bottom (default: true) */
  showStatusBar?: boolean;
  /** Show the context menu on right-click (default: true) */
  showContextMenu?: boolean;
  /** Additional className for the outer container */
  chromeClassName?: string;
}

/**
 * NoteEditorWithChrome — The standard note editor with all the chrome.
 *
 * This is the component you should use everywhere a note needs editing.
 * It includes the context menu and status bar automatically.
 */
export function NoteEditorWithChrome({
  // Chrome props
  noteId,
  isDirty = false,
  saveState = "saved",
  lastUpdatedAt,
  allFolders = [],
  currentFolder,
  onSave,
  onDuplicate,
  onExport,
  onShareLink,
  onShareClipboard,
  onMove,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onDelete,
  onVersionHistory,
  showStatusBar = true,
  showContextMenu = true,
  chromeClassName,
  // Core props (forwarded)
  content,
  onChange,
  editorMode,
  textareaRef: externalTextareaRef,
  tuiEditorRef,
  onVoiceTranscription,
  showVoiceButton = true,
  placeholder,
  className,
  readOnly,
  textareaClassName,
  previewClassName,
  syncScroll,
}: NoteEditorChromeProps) {
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalTextareaRef || internalTextareaRef;

  // Memoize noop callbacks to avoid unnecessary re-renders
  const noop = useCallback(() => {}, []);

  // ── Word/char count ──────────────────────────────────────────────────
  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [content]);

  const charCount = content.length;

  // ── Format relative time ─────────────────────────────────────────────
  const formattedTime = useMemo(() => {
    if (!lastUpdatedAt) return null;
    const d = new Date(lastUpdatedAt);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  }, [lastUpdatedAt]);

  // ── Status bar dot color ─────────────────────────────────────────────
  const statusDotClass = useMemo(() => {
    switch (saveState) {
      case "saved":
        return "bg-green-500";
      case "dirty":
        return "bg-amber-500";
      case "saving":
        return "bg-yellow-400 animate-pulse";
      case "conflict":
        return "bg-red-500";
      default:
        return "bg-muted-foreground";
    }
  }, [saveState]);

  const statusLabel = useMemo(() => {
    switch (saveState) {
      case "saved":
        return "Saved";
      case "dirty":
        return "Unsaved";
      case "saving":
        return "Saving...";
      case "conflict":
        return "Conflict";
      default:
        return "";
    }
  }, [saveState]);

  // ── Build the editor ─────────────────────────────────────────────────
  const editor = (
    <div className={cn("flex flex-col h-full w-full min-h-0", chromeClassName)}>
      <NoteEditorCore
        content={content}
        onChange={onChange}
        editorMode={editorMode}
        textareaRef={textareaRef}
        tuiEditorRef={tuiEditorRef}
        onVoiceTranscription={onVoiceTranscription}
        showVoiceButton={showVoiceButton}
        placeholder={placeholder}
        className={cn("flex-1 min-h-0", className)}
        readOnly={readOnly}
        textareaClassName={textareaClassName}
        previewClassName={previewClassName}
        syncScroll={syncScroll}
      />

      {/* ── Status Bar ──────────────────────────────────────────────── */}
      {showStatusBar && (
        <div className="flex items-center gap-3 px-4 py-0.5 border-t border-border/20 text-[0.6rem] text-muted-foreground/60 hover:text-muted-foreground transition-colors shrink-0 select-none">
          <span className="flex items-center gap-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", statusDotClass)} />
            {statusLabel}
          </span>
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
          {formattedTime && <span className="ml-auto">Updated {formattedTime}</span>}
        </div>
      )}
    </div>
  );

  // ── Wrap with context menu if enabled ─────────────────────────────────
  if (!showContextMenu) return editor;

  return (
    <NoteContextMenu
      noteId={noteId}
      editorMode={editorMode}
      isDirty={isDirty}
      allFolders={allFolders}
      currentFolder={currentFolder}
      noteContent={content}
      textareaRef={textareaRef}
      onSave={onSave ?? noop}
      onDuplicate={onDuplicate ?? noop}
      onExport={onExport ?? noop}
      onShareLink={onShareLink ?? noop}
      onShareClipboard={onShareClipboard ?? noop}
      onMove={onMove ?? noop}
      onCloseTab={onCloseTab ?? noop}
      onCloseOtherTabs={onCloseOtherTabs ?? noop}
      onCloseAllTabs={onCloseAllTabs ?? noop}
      onDelete={onDelete ?? noop}
      onVersionHistory={onVersionHistory}
    >
      {editor}
    </NoteContextMenu>
  );
}

export { type EditorMode } from "./NoteEditorCore";
