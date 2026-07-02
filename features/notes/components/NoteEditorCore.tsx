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
import { ProTextarea } from "@/components/official/ProTextarea";
import { MatrxSplit } from "@/components/matrx/MatrxSplit";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type {
  ContentSource,
  RichDocumentActionsVariant,
} from "@/features/rich-document/types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { cn } from "@/lib/utils";
import type { TuiEditorContentRef } from "@/components/mardown-display/chat-markdown/tui/TuiEditorContent";

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
  tuiEditorRef?: React.MutableRefObject<TuiEditorContentRef | null>;
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
   * Explicit content source for the preview/split RichDocument, overriding the
   * `noteId ? note : raw` default. Non-note editors that reuse this core (the
   * working document / scratchpad) pass their own source — e.g.
   * `{ type: "working-document", conversationId, kind }` — so edit-through,
   * save-to-task linking, and the right-click menu operate on the real entity.
   */
  actionsSource?: ContentSource;
  /**
   * Override the inline action variant rendered over the preview (and the
   * split preview pane). Defaults to a full `bar` in preview / a hover
   * `icon-only` in split. Hosts that carry their OWN persistent action surface
   * elsewhere (the working-document panel renders the bar in its header, in
   * every view mode) pass `"none"` to suppress the in-body bar while keeping
   * the right-click context menu. Ignored when `actionsSurfaceId` is set
   * (that already routes actions remotely).
   */
  previewActionsVariant?: RichDocumentActionsVariant;
  /**
   * When provided, the preview/split action surface renders REMOTELY to a
   * `<RichDocumentActionSurface surfaceId={...}/>` the parent mounts (e.g. a
   * page header) instead of inline. When omitted, actions render inline
   * (a bar under the preview, a hover icon over the split preview pane).
   */
  actionsSurfaceId?: string;
  /**
   * Use the large, persistent, high-contrast scrollbar
   * (`scrollbar-contrast-lg`) instead of the default ultra-thin one. Opt-in
   * for long-form surfaces like the full Notes route where finding and
   * grabbing the bar matters. Default false keeps small/embedded surfaces
   * (quick-save popover, inline file previews) on the minimal scrollbar.
   */
  largeScrollbar?: boolean;
  /**
   * Embedded surfaces (War Room tiles, inline previews) where the editor lives
   * in a small, height-bounded box rather than a full page. Drops the
   * `pb-[85dvh]` scroll-to-middle padding (which is only desirable full-page and
   * otherwise balloons the content far past its container, bleeding over
   * neighbors). Default false preserves the full-page behavior.
   */
  embedded?: boolean;
  /**
   * Surface Registry name (`matrx-user/notes`). When set, the PLAIN-mode body
   * renders a `ProTextarea` whose "…" menu lists the surface's bound agents
   * (My / System / Shared / org) and whose voice/copy/clean-up come for free —
   * the same agent affordances the right-click menu offers, inline on the body.
   * When omitted, the plain body stays the bare `Textarea` (every existing
   * consumer is unchanged). Pair with `getApplicationScope` for full scope.
   */
  surfaceName?: string;
  /**
   * Live scope builder handed to the plain-mode `ProTextarea` (only used when
   * `surfaceName` is set). Reads the textarea selection + Redux at call time so
   * bound-agent runs from the body get the same rich `matrx-user/notes` scope
   * as the context menu. See `useNotesSurfaceScope`.
   */
  getApplicationScope?: () => ApplicationScope;
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
  actionsSource,
  previewActionsVariant,
  actionsSurfaceId,
  largeScrollbar = false,
  embedded = false,
  surfaceName,
  getApplicationScope,
}: NoteEditorCoreProps) {
  // Full-page surfaces pad the bottom by 85dvh so the last line can scroll to
  // the middle; embedded/tile surfaces must NOT (it balloons content past the
  // box and bleeds over neighbors).
  const bottomPad = embedded ? "pb-6" : "pb-[85dvh]";
  // Long-form surfaces (full Notes route) opt into the larger, persistent,
  // higher-contrast scrollbar; everything else keeps the default ultra-thin.
  const previewScrollbarClass = largeScrollbar
    ? "scrollbar-contrast-lg"
    : "scrollbar-thin-auto";
  // Shared content source + action placement for the preview / split panes.
  // An explicit `actionsSource` (working document, etc.) wins; otherwise derive
  // from noteId.
  const richSource: ContentSource =
    actionsSource ?? (noteId ? { type: "note", noteId } : { type: "raw" });
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const internalTuiRef = useRef<TuiEditorContentRef>(null);

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

  // The agent-wired ProTextarea (plain mode + `surfaceName`) brings its OWN
  // voice control, so suppress this overlay there to avoid two stacked mics.
  // Every other mode (split / wysiwyg / markdown-split) still needs it.
  const showVoiceOverlay =
    showVoiceButton &&
    !readOnly &&
    !(editorMode === "plain" && Boolean(surfaceName));

  return (
    <div className={cn("relative w-full h-full", className)}>
      {/* Voice button overlay */}
      {showVoiceOverlay && (
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
          {surfaceName ? (
            // Agent-wired surface: ProTextarea gives the body the same agent
            // affordances ("…" bound agents, voice, copy, clean-up) the
            // right-click menu offers. Ref forwards to the real textarea, so
            // cursor ops / find&replace / voice insertion are unchanged.
            <ProTextarea
              ref={textareaRef}
              surfaceName={surfaceName}
              getApplicationScope={getApplicationScope}
              value={content}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={readOnly}
              wrapperClassName="absolute inset-0 w-full h-full"
              className={cn(
                "w-full h-full resize-none border-0 shadow-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "text-sm leading-relaxed bg-transparent p-3",
                bottomPad,
                largeScrollbar && "scrollbar-contrast-lg",
                textareaClassName,
              )}
            />
          ) : (
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              readOnly={readOnly}
              className={cn(
                "absolute inset-0 w-full h-full resize-none border-0",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "text-sm leading-relaxed bg-transparent p-3",
                bottomPad,
                // Notes get long — opt into the larger, persistent,
                // higher-contrast scrollbar so it's easy to find and grab.
                largeScrollbar && "scrollbar-contrast-lg",
                textareaClassName,
              )}
            />
          )}
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
          textareaClassName={cn(
            bottomPad,
            largeScrollbar && "scrollbar-contrast-lg",
            textareaClassName,
          )}
          previewClassName={cn(
            bottomPad,
            largeScrollbar && "scrollbar-contrast-lg",
            previewClassName,
          )}
          actionsSource={richSource}
          actionsVariant={
            actionsSurfaceId
              ? "remote"
              : (previewActionsVariant ?? "icon-only")
          }
          actionsSurfaceId={actionsSurfaceId}
        />
      )}

      {/* ── Preview (Markdown with full edit-through) ───────────────── */}
      {editorMode === "preview" && (
        <div
          ref={previewContainerRef}
          className={cn(
            "h-full overflow-y-auto max-w-3xl mx-auto py-2 px-4",
            bottomPad,
            previewScrollbarClass,
            previewClassName,
          )}
        >
          <RichDocument
            key={resetKey}
            content={content}
            source={richSource}
            actionsVariant={
              actionsSurfaceId ? "remote" : (previewActionsVariant ?? "bar")
            }
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
  tuiEditorRef?: React.MutableRefObject<TuiEditorContentRef | null>,
): string {
  if (
    (editorMode === "wysiwyg" || editorMode === "markdown-split") &&
    tuiEditorRef?.current?.getCurrentMarkdown
  ) {
    return tuiEditorRef.current.getCurrentMarkdown();
  }
  return content;
}
