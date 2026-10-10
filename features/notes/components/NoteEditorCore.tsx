"use client";

// NoteEditorCore — The single, reusable editor unit for notes.
// Works in ALL contexts: desktop workspace, mobile, floating window, quick notes, embedded panels.
//
// What it owns:
// - Editor mode switching:
//     split    the quick textarea on the left (the agent-wired one when a host
//              passes `surfaceName`), the formatted note live on the right
//              through the shared renderer (MatrxSplit, scroll-synced) — the
//              notes desktop default
//     plain    that textarea alone — never auto-formats anything
//     write    THE ONE EDITOR's visual view (components/rich-editor)
//     preview  read-only, the shared renderer (RichDocument → RichContent full)
//     source   THE ONE EDITOR's CodeMirror source view (hosts that offer it;
//              notes do not — Split is notes' source-plus-preview mode)
//   Toast UI is gone from this file for good (guard:
//   features/notes/__tests__/notes-never-mount-toast-ui.test.ts).
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

import React, { useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useTextareaFormatting } from "@ai-matrx/rich-editor/format/useTextareaFormatting";
import { createMarkdownImageUpload } from "@ai-matrx/rich-editor/format/markdown-image-upload";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { fileUrls } from "@/features/files/handler/utils/python-base";
import { Textarea } from "@/components/ui/textarea";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MatrxSplit } from "@/components/matrx/MatrxSplit";
import { useMeasure } from "@ai-matrx/kit/hooks";
import {
  type ScrollEdgeIntent,
  useScrollEdgeIntent,
} from "@/components/matrx/useTrimEdgeScrollIntent";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { RichDocument } from "@ai-matrx/rich-content/rich-document/RichDocument";
import type {
  ContentSource,
  RichDocumentActionsVariant,
} from "@ai-matrx/rich-content/rich-document/types";
import type { ApplicationScope } from "@ai-matrx/chat/agents/types/scope.types";
import {
  toastNoteWriteBlocked,
  NOTE_READONLY_SAVE_MESSAGE,
} from "../utils/writeErrors";
import { cn } from "@/lib/utils";
import { EditInPlace } from "@ai-matrx/rich-editor/in-place/EditInPlace";
import RichEditor, {
  type RichEditorController,
  type RichEditorView,
} from "@ai-matrx/rich-editor/editor/RichEditor";
import { noteIdentityContentSource } from "../richDocumentSource";
import type { ImagePolicyDeclaration } from "@ai-matrx/rich-content/levels/prose/remote-image-policy";
import { NOTE_EXCLUDED_ACTIONS } from "../constants/noteExcludedActions";

function assignRef<T>(ref: React.Ref<T> | undefined, node: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(node);
  else (ref as React.MutableRefObject<T | null>).current = node;
}

// ── Types ────────────────────────────────────────────────────────────────────


/** Below this width of the editor's own box, Split shows one pane (30rem: two ≥ 240px columns). */
export const SPLIT_MIN_WIDTH_PX = 480;

export type EditorMode = "plain" | "write" | "source" | "preview" | "split";

/** The modes THE ONE EDITOR renders (one instance serves both). */
export function isRichEditorMode(mode: EditorMode): mode is "write" | "source" {
  return mode === "write" || mode === "source";
}

const RICH_VIEW: Record<"write" | "source", RichEditorView> = {
  write: "visual",
  source: "source",
};

/** The editor's own view as a notes mode (its ⌘-shortcut can switch views). */
export function editorModeForRichView(view: RichEditorView): EditorMode {
  return view === "visual" ? "write" : view;
}

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
  /** THE ONE EDITOR's controller (write + source modes): caret inserts, find, outline jumps. */
  richEditorRef?: React.Ref<RichEditorController>;
  /**
   * The editor switched its own view (write ↔ source ↔ preview) — by shortcut, or
   * back after a refused switch. Hosts that hold the mode follow it.
   */
  onEditorModeChange?: (mode: EditorMode) => void;
  /**
   * The host wraps this core in its OWN right-click menu (the Notes editor's
   * menu, with the note's rows and scope). The one editor then mounts none.
   */
  hostContextMenu?: boolean;
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
  /** One finite request to reveal the edge changed by a content trim. */
  scrollIntent?: ScrollEdgeIntent;
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
  /**
   * Pin ProTextarea's live stats bar under the textarea. Notes hosts own
   * metrics in `NoteStatsFooter` — leave this false (default) so the editor
   * body never grows a second footer that floats mid-pane.
   */
  enableTextStats?: boolean;
  /**
   * WHO WROTE the content shown — "self" | "other" | "ai" (or "inherit").
   * Decides whether remote images load by themselves; forwarded to the
   * renderer (components/rich-content/prose/remote-image-policy.tsx).
   */
  imagePolicy?: ImagePolicyDeclaration;
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
  editorMode: requestedEditorMode,
  textareaRef: externalTextareaRef,
  richEditorRef,
  onEditorModeChange,
  hostContextMenu = false,
  onVoiceTranscription,
  showVoiceButton = false,
  placeholder = "Start typing your note...",
  className,
  readOnly = false,
  textareaClassName,
  previewClassName,
  syncScroll = true,
  resetKey,
  scrollIntent,
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
  enableTextStats = false,
  imagePolicy,
}: NoteEditorCoreProps) {
  // Plain is an editing view. A person who may only READ the note gets the
  // canonical rendered view, never its raw source (round 6, R6).
  const editorMode: EditorMode =
    readOnly && requestedEditorMode === "plain" ? "preview" : requestedEditorMode;
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
    actionsSource ?? (noteId ? noteIdentityContentSource(noteId, `editor-core:${noteId}`) : { type: "raw" });
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const inactiveScrollRef = useRef<HTMLElement | null>(null);

  // Use external refs if provided, otherwise internal
  const textareaRef = externalTextareaRef || internalTextareaRef;
  // Plain mode's bare Textarea (no agent surface) joins the ONE formatting
  // command layer here; the agent-wired ProTextarea and Split's editor carry
  // it themselves.
  const [plainFormatElement, setPlainFormatElement] = useState<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const next = editorMode === "plain" && !surfaceName ? textareaRef.current : null;
    if (next !== plainFormatElement) setPlainFormatElement(next);
  });
  // A pasted or dropped image uploads to the platform's files and lands as
  // `![name](url)` at the caret — in Plain and Split, as in Write.
  const { upload } = useFileUpload();
  const uploadImage = createMarkdownImageUpload(upload, fileUrls);
  useTextareaFormatting(plainFormatElement, !readOnly, { uploadImage });

  useScrollEdgeIntent(
    scrollIntent,
    [
      editorMode === "split"
        ? inactiveScrollRef
        : (textareaRef as React.RefObject<HTMLElement | null>),
      editorMode === "split"
        ? inactiveScrollRef
        : previewScrollRef,
    ],
    editorMode,
  );

  const setPreviewScrollRef = (node: HTMLDivElement | null) => {
    assignRef(previewScrollRef, node);
    assignRef(previewContainerRef, node);
  };

  // Discrete-edit handler: prefer `onChangeFlush` if the parent provides one,
  // otherwise fall back to `onChange`.
  const flushChange = onChangeFlush ?? onChange;

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

  // The agent-wired ProTextarea (plain / split + `surfaceName`) brings its OWN
  // voice control, so suppress this overlay there to avoid two stacked mics.
  // Every other editable mode (write / source) still needs it.
  // SPLIT NEEDS ROOM: two columns in a narrow box (a Board note tile) wrap the
  // text a character or two per line. Below `SPLIT_MIN_WIDTH_PX` of the
  // editor's OWN width, Split shows one pane with an Edit / Preview toggle.
  // Width 0 = not measured yet: the side-by-side layout is kept until it is.
  const [rootRef, { width: rootWidth }] = useMeasure<HTMLDivElement>();
  const splitSinglePane = rootWidth !== null && rootWidth > 0 && rootWidth < SPLIT_MIN_WIDTH_PX;

  const showVoiceOverlay =
    showVoiceButton &&
    !readOnly &&
    !((editorMode === "plain" || editorMode === "split") && Boolean(surfaceName));

  return (
    <div ref={rootRef} className={cn("relative w-full h-full", className)}>
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
              data-kind-source="explicit"
              surfaceName={surfaceName}
              getApplicationScope={getApplicationScope}
              uploadImage={readOnly ? undefined : uploadImage}
              value={content}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              // readOnly, not disabled — viewers still select/copy/scroll.
              readOnly={readOnly}
              // Stats live in NoteStatsFooter — never pin a bar inside the editor.
              enableTextStats={enableTextStats}
              defaultShowTextStatsBar={false}
              wrapperClassName="absolute inset-0 w-full h-full"
              className={cn(
                "w-full h-full resize-none border-0 shadow-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                // The same reading column and type size as Write and Read
                // (48rem, 14px — the app's rendered-text size): the padding
                // centres the text while the scrollbar stays at the edge.
                "text-sm leading-relaxed bg-transparent py-6 px-[max(1.5rem,calc((100%-48rem)/2))]",
                bottomPad,
                largeScrollbar && "scrollbar-contrast-lg",
                textareaClassName,
              )}
            />
          ) : (
            <Textarea
              ref={textareaRef}
              data-kind-source="explicit"
              value={content}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              readOnly={readOnly}
              className={cn(
                "absolute inset-0 w-full h-full resize-none border-0",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                // The same reading column and type size as Write and Read
                // (48rem, 14px — the app's rendered-text size): the padding
                // centres the text while the scrollbar stays at the edge.
                "text-sm leading-relaxed bg-transparent py-6 px-[max(1.5rem,calc((100%-48rem)/2))]",
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
        <MatrxSplit imagePolicy={imagePolicy}
          value={content}
          readOnly={readOnly}
          onChange={readOnly ? () => {} : onChange}
          textareaRef={
            textareaRef as React.RefObject<HTMLTextAreaElement | null>
          }
          uploadImage={uploadImage}
          placeholder={placeholder}
          className="absolute inset-0"
          singlePane={splitSinglePane}
          syncScroll={syncScroll}
          // Notes never open a second editor: the header's views are the one
          // switch, so the full-screen editor (its own mode chooser) is off.
          allowFullScreenEditor={false}
          actionsExclude={NOTE_EXCLUDED_ACTIONS}
          editorOverlay={findOverlay}
          previewContainerRef={previewContainerRef}
          // Both panes start at the 24px every other view starts at (the
          // preview's renderer adds its own 4px).
          textareaClassName={cn(
            "pt-6",
            bottomPad,
            largeScrollbar && "scrollbar-contrast-lg",
            textareaClassName,
          )}
          previewClassName={cn(
            "pt-5",
            bottomPad,
            largeScrollbar && "scrollbar-contrast-lg",
            previewClassName,
          )}
          actionsSource={richSource}
          actionsVariant={
            actionsSurfaceId ? "remote" : (previewActionsVariant ?? "icon-only")
          }
          actionsSurfaceId={actionsSurfaceId}
          contentResetKey={resetKey}
          scrollIntent={scrollIntent}
          surfaceName={surfaceName}
          getApplicationScope={getApplicationScope}
        />
      )}

      {/* ── Preview (Markdown with full edit-through) ───────────────── */}
      {editorMode === "preview" && (
        <div
          ref={setPreviewScrollRef}
          className={cn(
            // pt-5 + the renderer's own pt-1 = the 24px Write and Plain start at.
            // 51rem - 2 × 1.5rem = the same 48rem column Plain and Write use, so
            // the text starts at one x in every view.
            "h-full overflow-y-auto max-w-[51rem] mx-auto pt-5 pb-6 px-6",
            bottomPad,
            previewScrollbarClass,
            previewClassName,
          )}
        >
          {/* EDIT IN PLACE (components/rich-editor/in-place): a double-click on
              the text opens THE ONE editor right here and autosaves through the
              note's own onChange; Escape / ⌘Enter returns to Read. The note's
              mode never changes — Read stays the note's view. */}
          <EditInPlace
            key={resetKey}
            value={content}
            canEdit={!readOnly}
            mode="autosave"
            write={(text) => onChange(text)}
            discardDescription="The note goes back to how it was when you opened the editor."
            editor={{
              imagePolicy,
              surfaceName: surfaceName ?? "matrx-user/notes",
              sourceFeature: "notes",
              contentSource: richSource,
              placeholder,
            }}
          >
          <RichDocument imagePolicy={imagePolicy}
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
            // No full-screen editor in Notes (a second editor with its own
            // view chooser); "Edit content" is Write in the header instead.
            allowFullScreenEditor={false}
            actions={{ exclude: NOTE_EXCLUDED_ACTIONS }}
            onContentChange={
              readOnly
                ? () =>
                    toastNoteWriteBlocked(
                      noteId ?? "readonly-preview",
                      NOTE_READONLY_SAVE_MESSAGE,
                    )
                : onChange
            }
          />
          </EditInPlace>
        </div>
      )}

      {/* ── Write + Source (THE ONE EDITOR) ─────────────────────────── */}
      {/* ONE instance serves both modes, so switching Write ↔ Source keeps the
          editor (and delivers pending typing) instead of remounting it. The host's
          mode control is the one view switch — the editor draws no toolbar row. */}
      {isRichEditorMode(editorMode) && (
        // Write reads in the same font and size as Read and Plain (14px app
        // sans) — `!` because the editor's own prose-base is also a utility.
        // rich-editor.css neutralises Toast UI's global 13px Open Sans rule.
        // One column in every view: the editor's own side padding is dropped
        // (its 48rem container already centres it where Plain and Read start),
        // and lists indent 24px as Read's do.
        <div
          className={cn(
            "absolute inset-0 w-full h-full [&_.ProseMirror]:font-sans [&_.ProseMirror]:text-sm! [&_.ProseMirror]:px-0! [&_.ProseMirror_ul]:pl-6! [&_.ProseMirror_ol]:pl-6! [&_.ProseMirror_li]:pl-0!",
            // THE READING INSET, every host: the editor's 48rem column kept no
            // side padding of its own (ProseMirror's is dropped above), so in a
            // host narrower than 48rem — a Board tile, the /notes column — the
            // text touched the left edge. Same formula as Plain's textarea:
            // 1.5rem minimum, centred 48rem column when wider.
            "[&_.rich-editor-visual>div]:max-w-none! [&_.rich-editor-visual>div]:px-[max(1.5rem,calc((100%-48rem)/2))]! [&_.rich-editor-source>div]:max-w-none! [&_.rich-editor-source>div]:px-[max(1.5rem,calc((100%-48rem)/2))]!",
            // Match Plain/Split/Read inside the rich editor's scroll owners.
            // Padding the frame instead would lift the host's metadata/footer.
            // Embedded hosts keep the rich editor's existing compact runway.
            !embedded &&
              "[&_.rich-editor-visual>div]:pb-[85dvh]! [&_.rich-editor-source>div]:pb-[85dvh]!",
          )}
        >
          <RichEditor
            key={resetKey}
            value={content}
            onChange={onChange}
            view={RICH_VIEW[editorMode]}
            onViewChange={
              onEditorModeChange
                ? (view) => onEditorModeChange(editorModeForRichView(view))
                : undefined
            }
            chrome="bare"
            hostContextMenu={hostContextMenu}
            controllerRef={richEditorRef}
            readOnly={readOnly}
            placeholder={placeholder}
            surfaceName={surfaceName ?? "matrx-user/notes"}
            sourceFeature="notes"
            contentSource={richSource}
            defaultOutlineOpen={false}
            imagePolicy={imagePolicy}
            className="h-full"
          />
        </div>
      )}
    </div>
  );
}
