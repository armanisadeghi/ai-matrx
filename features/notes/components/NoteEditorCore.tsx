"use client";

// NoteEditorCore — The single, reusable editor unit for notes.
// Works in ALL contexts: desktop workspace, mobile, floating window, quick notes, embedded panels.
//
// What it owns:
// - Editor mode switching (plain, split, preview, wysiwyg, markdown-split)
// - Textarea ref forwarding (cursor ops, voice input, context menus)
// - Voice input integration
// - Content rendering per mode
//
// What the PARENT owns:
// - Auto-save (hook-based, different debounce per context)
// - Tab/cache management
// - Metadata UI (title, folder, tags)
// - Context menus (wrapped externally)
// - Conflict resolution UI

import React, { useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { MatrxSplit } from "@/components/matrx/MatrxSplit";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";
import { cn } from "@/lib/utils";

const TuiEditorContent = dynamic(
  () =>
    import("@/components/mardown-display/chat-markdown/tui/TuiEditorContent"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    ),
  },
);

// ── Types ────────────────────────────────────────────────────────────────────

export type EditorMode =
  | "plain"
  | "split"
  | "preview"
  | "wysiwyg"
  | "markdown-split";

export interface NoteEditorCoreProps {
  /** Current note content (controlled) */
  content: string;
  /** Called on every content change (keystroke-rate; parent typically debounces) */
  onChange: (content: string) => void;
  /**
   * Called on discrete, non-keystroke edits (preview block edits, voice
   * transcription, WYSIWYG changes). When provided, the parent is expected
   * to flush the change immediately — bypassing any keystroke debounce —
   * so Redux/persistence stay in perfect sync with what's on screen.
   * Falls back to `onChange` when omitted.
   */
  onChangeFlush?: (content: string) => void;
  /** Active editor mode */
  editorMode: EditorMode;
  /** Ref to the underlying textarea (plain + split modes). Parent uses for cursor ops. */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Ref to TUI editor instance (wysiwyg + markdown-split modes) */
  tuiEditorRef?: React.MutableRefObject<any>;
  /** Called when voice transcription completes. If not provided, default inserts at cursor. */
  onVoiceTranscription?: (text: string) => void;
  /** Show the microphone button (top-right overlay) */
  showVoiceButton?: boolean;
  /** Textarea placeholder */
  placeholder?: string;
  /** Additional className for the outer container */
  className?: string;
  /** Disable editing */
  readOnly?: boolean;
  /** Additional className for the textarea element */
  textareaClassName?: string;
  /** Additional className for the preview pane */
  previewClassName?: string;
  /** Sync scroll in split mode (default: true) */
  syncScroll?: boolean;
  /**
   * Forces rich editors (MarkdownStream in preview / MatrxSplit preview pane)
   * to remount when this value changes. Parents use this to discard any local
   * edit overlay inside the rich editor when an authoritative external content
   * update arrives (note switch, realtime update, undo, fetch).
   */
  resetKey?: string;
  /**
   * Optional overlay rendered absolutely on top of the primary editor surface
   * (plain textarea, or the editor side in split mode). Must be
   * pointer-events:none so the textarea stays interactive. Used by find &
   * replace to paint match highlights.
   */
  findOverlay?: React.ReactNode;
  /**
   * Optional ref to the preview scroll container. Consumers use this to
   * register CSS highlight ranges, measure scroll, etc.
   */
  previewContainerRef?: React.Ref<HTMLDivElement | null>;
  /**
   * When provided, the preview mode wraps its rendered content in a
   * RichDocument with source `{ type: "note", noteId }` so the action bar
   * surfaces note-specific operations (copy, save-to-task, print, etc.).
   * When omitted, the preview uses `{ type: "raw" }` — actions still
   * appear but `save-to-task` won't link to a parent note row.
   */
  noteId?: string;
  /**
   * When provided, the preview/split action surface renders REMOTELY to a
   * `<RichDocumentActionSurface surfaceId={...}/>` the parent mounts (e.g. a
   * page header) instead of inline. When omitted, actions render inline
   * (a bar under the preview, a hover icon over the split preview pane).
   */
  actionsSurfaceId?: string;
}

/**
 * NoteEditorCore — The universal note editor.
 *
 * Renders the appropriate editor surface based on `editorMode`.
 * Forwards refs so parents can interact with textarea/TUI for
 * cursor operations, voice input insertion, and context menus.
 */
export function NoteEditorCore({
  content,
  onChange,
  onChangeFlush,
  editorMode,
  textareaRef: externalTextareaRef,
  tuiEditorRef: externalTuiRef,
  onVoiceTranscription,
  showVoiceButton = false,
  placeholder = "Start typing your note...",
  className,
  readOnly = false,
  textareaClassName,
  previewClassName,
  syncScroll = true,
  resetKey,
  findOverlay,
  previewContainerRef,
  noteId,
  actionsSurfaceId,
}: NoteEditorCoreProps) {
  // Shared content source + action placement for the preview / split panes.
  const richSource: ContentSource = noteId
    ? { type: "note", noteId }
    : { type: "raw" };
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const internalTuiRef = useRef<any>(null);

  // Discrete-edit handler: prefer `onChangeFlush` if the parent provides one,
  // otherwise fall back to `onChange`.
  const flushChange = onChangeFlush ?? onChange;

  // Use external refs if provided, otherwise internal
  const textareaRef = externalTextareaRef || internalTextareaRef;
  const tuiEditorRef = externalTuiRef || internalTuiRef;

  // Keep content ref for voice transcription
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Voice transcription: ALWAYS append at the end with a blank line separator.
  // Never insert inline at cursor — it disrupts the flow of existing content.
  const handleTranscription = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      if (onVoiceTranscription) {
        onVoiceTranscription(text);
        return;
      }

      // Always append at end with blank line
      const current = contentRef.current;
      const separator = current.length > 0 ? "\n\n" : "";
      const newContent = current + separator + text;
      flushChange(newContent);

      // Move cursor to end
      const textarea = textareaRef.current;
      if (textarea) {
        requestAnimationFrame(() => {
          textarea.selectionStart = newContent.length;
          textarea.selectionEnd = newContent.length;
          textarea.focus();
        });
      }
    },
    [onVoiceTranscription, flushChange, textareaRef],
  );

  // TUI editor change handler
  const handleTuiChange = useCallback(
    (value: string) => {
      onChange(value);
    },
    [onChange],
  );

  return (
    <div className={cn("relative w-full h-full", className)}>
      {/* Voice button overlay */}
      {showVoiceButton && !readOnly && (
        <div className="absolute top-2 right-2 z-10">
          <MicrophoneIconButton
            onTranscriptionComplete={handleTranscription}
            variant="icon-only"
            size="sm"
          />
        </div>
      )}

      {/* ── Plain Text ──────────────────────────────────────────────── */}
      {editorMode === "plain" && (
        <>
          <Textarea
            ref={(el) => {
              if (textareaRef && "current" in textareaRef) {
                (
                  textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>
                ).current = el;
              }
            }}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            className={cn(
              "absolute inset-0 w-full h-full resize-none border-0",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "text-sm leading-relaxed bg-transparent p-3 pb-[85dvh]",
              textareaClassName,
            )}
          />
          {findOverlay}
        </>
      )}

      {/* ── Split View (MatrxSplit) ─────────────────────────────────── */}
      {editorMode === "split" && (
        <MatrxSplit
          key={resetKey}
          value={content}
          onChange={readOnly ? () => {} : onChange}
          textareaRef={
            textareaRef as React.RefObject<HTMLTextAreaElement | null>
          }
          placeholder={placeholder}
          className="absolute inset-0"
          syncScroll={syncScroll}
          allowFullScreenEditor={true}
          editorOverlay={findOverlay}
          previewContainerRef={previewContainerRef}
          textareaClassName={cn("pb-[85dvh]", textareaClassName)}
          previewClassName={cn("pb-[85dvh]", previewClassName)}
          actionsSource={richSource}
          actionsVariant={actionsSurfaceId ? "remote" : "icon-only"}
          actionsSurfaceId={actionsSurfaceId}
        />
      )}

      {/* ── Preview (Markdown with full edit-through) ───────────────── */}
      {editorMode === "preview" && (
        <div
          ref={(el) => {
            if (previewContainerRef) {
              if (typeof previewContainerRef === "function") {
                previewContainerRef(el);
              } else {
                (
                  previewContainerRef as React.MutableRefObject<HTMLDivElement | null>
                ).current = el;
              }
            }
          }}
          className={cn(
            "h-full overflow-y-auto max-w-3xl mx-auto py-2 px-4 pb-[85dvh] scrollbar-thin-auto",
            previewClassName,
          )}
        >
          <RichDocument
            key={resetKey}
            content={content}
            source={richSource}
            actionsVariant={actionsSurfaceId ? "remote" : "bar"}
            actionsSurfaceId={actionsSurfaceId}
            actionsClassName="mb-2"
            enableContextMenu
            isStreamActive={false}
            hideCopyButton={true}
            allowFullScreenEditor={true}
            onContentChange={readOnly ? undefined : onChange}
          />
        </div>
      )}

      {/* ── WYSIWYG (TUI Editor) ────────────────────────────────────── */}
      {editorMode === "wysiwyg" && (
        <div className="absolute inset-0 w-full h-full">
          <TuiEditorContent
            ref={tuiEditorRef}
            content={content}
            onChange={handleTuiChange}
            isActive={true}
            editMode="wysiwyg"
            className="w-full h-full"
          />
        </div>
      )}

      {/* ── Markdown Split (TUI Editor in markdown mode) ────────────── */}
      {editorMode === "markdown-split" && (
        <div className="absolute inset-0 w-full h-full">
          <TuiEditorContent
            ref={tuiEditorRef}
            content={content}
            onChange={handleTuiChange}
            isActive={true}
            editMode="markdown"
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  );
}

// ── Helper: Get current content from the right source ────────────────────────

/**
 * Reads the latest content from the appropriate editor surface.
 * Useful for force-save and mode-switch scenarios where TUI state
 * may diverge from the controlled `content` prop.
 */
export function getCurrentEditorContent(
  editorMode: EditorMode,
  content: string,
  tuiEditorRef?: React.MutableRefObject<any>,
): string {
  if (
    (editorMode === "wysiwyg" || editorMode === "markdown-split") &&
    tuiEditorRef?.current?.getCurrentMarkdown
  ) {
    return tuiEditorRef.current.getCurrentMarkdown();
  }
  return content;
}
