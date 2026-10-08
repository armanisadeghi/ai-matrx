"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { useTextareaFormatting } from "@ai-matrx/rich-editor/format/useTextareaFormatting";
import { formatTargetWithin } from "@ai-matrx/rich-editor/format/format-target";
import { Eye } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useNotesRedux } from "../../hooks/useNotesRedux";
import { useNoteAccess } from "../../hooks/useNoteAccess";
import { useNoteWorkingCopy } from "../../hooks/useNoteWorkingCopy";
import { noteWorkingCopy } from "../../utils/noteLiveContent";
import { NoteEditorDock } from "./NoteEditorDock";
import { useNoteDelete } from "../../hooks/useNoteDelete";
import { useToastManager } from "@/hooks/useToastManager";
import { toastErrorAlreadyCaptured } from "@/lib/toast";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { CONTEXT_MENU_HEADING_KEY } from "@/features/context-menu-v3/types";
import { RichDocument } from "@ai-matrx/rich-content/rich-document/RichDocument";
import { EditInPlace } from "@ai-matrx/rich-editor/in-place/EditInPlace";
import { NOTE_EXCLUDED_ACTIONS } from "../../constants/noteExcludedActions";
import { noteIdentityContentSource } from "../../richDocumentSource";
import { usePreparedNoteContentSource } from "../../usePreparedNoteContentSource";
import type { Note } from "@/features/notes/types";
import { NOTES_EDITOR_CONTEXT_MENU_PROPS } from "@/features/notes/agent-context/buildNotesEditorContextData";
import { useNotesSurfaceRuntime } from "@/features/notes/agent-context/useNotesSurfaceRuntime";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { useOptionalNotesInstanceId } from "../../context/NotesInstanceContext";
import RichEditor, { type RichEditorController } from "@ai-matrx/rich-editor/editor/RichEditor";
import { isRichEditorMode, type EditorMode } from "../NoteEditorCore";
import { useRememberNoteEditorMode } from "../../hooks/usePreferredDefaultEditorMode";
import { updateNoteTags, updateNoteLabel } from "../../redux/slice";
import { saveNote } from "../../redux/thunks";
import {
  selectNoteById,
  selectNoteContent,
  selectNoteFolder,
  selectNoteIsDirtyById,
  selectNoteIsSavingById,
  selectNoteLabel,
  selectNoteTags,
} from "../../redux/selectors";
import { NoteSaveFailureBanner } from "../NoteSaveFailureBanner";
import { NoteDraftRecoveryBanner } from "../NoteDraftRecoveryBanner";
import { NoteWorkingCopyAlert } from "../NoteWorkingCopyAlert";
import { authoredBy } from "@ai-matrx/rich-content/levels/prose/remote-image-policy";
import { cn } from "@/lib/utils";
import { insertAtRichCaret } from "@ai-matrx/rich-editor/editor/caretInsert";
import { downloadFile } from "@ai-matrx/kit/download";

/**
 * The phone's modes: Plain (its default) and Write (the one editor). "preview"
 * is never picked on a phone — it is what a viewer who may not edit is shown.
 */
export type MobileEditorMode = Extract<EditorMode, "plain" | "write" | "preview">;

/** State the editor exposes to MobileNotesView's header save button/dirty poll. */
interface MobileNoteEditorWindowState {
  isDirty: boolean;
  isSaving: boolean;
  handleSave: () => Promise<void>;
}

declare global {
  interface Window {
    // Escape hatch so MobileNotesView's header can drive the mounted editor
    // without a prop-drilled ref (header and editor are siblings under a view switch).
    __mobileNoteEditorState?: MobileNoteEditorWindowState;
  }
}

interface MobileNoteEditorProps {
  note: Note;
  editorMode: MobileEditorMode;
  onBack: () => void;
}

export default function MobileNoteEditor({
  note,
  editorMode,
  onBack,
}: MobileNoteEditorProps) {
  const noteId = note.id;
  const dispatch = useAppDispatch();
  const { copyNote, moveNote, moveNoteToNewFolder, setActiveNoteDirty } =
    useNotesRedux();
  const toast = useToastManager("notes");

  // A viewer-level sharee gets a read-only surface — their RLS-rejected
  // saves would otherwise silently discard every edit.
  const access = useNoteAccess(noteId);
  const readOnly = access.readOnly;
  // Write and Plain are editing views — a viewer reads the rendered note,
  // never its raw source (round 6, R6).
  const effectiveMode: MobileEditorMode =
    readOnly && (isRichEditorMode(editorMode) || editorMode === "plain") ? "preview" : editorMode;
  const richMode = isRichEditorMode(effectiveMode);
  const rememberEditedMode = useRememberNoteEditorMode();

  // ── THE RECORD IS THE TRUTH ────────────────────────────────────────
  // This editor used to keep label/content/folder/tags in React state with a
  // bespoke 2s timer and its own baseline/dirty/failed bookkeeping. It is now
  // the same machine as `NoteContentEditor`: every change goes to Redux
  // (the note's working copy, whose save is the note's ONE save door), and
  // dirty/saving are read back off the record.
  const record = useAppSelector(selectNoteById(noteId));
  const reduxContent = useAppSelector(selectNoteContent(noteId)) ?? "";
  const noteLabel = useAppSelector(selectNoteLabel(noteId)) ?? note.label ?? "";
  // Every long-press sheet and menu on this note is titled with the note's
  // NAME ("Note: Clinic intake checklist"), never "Content: <its body>" — the
  // same heading the desktop tab gives the note's menu. A selection still
  // shows itself.
  const noteMenuHeading = () => ({
    [CONTEXT_MENU_HEADING_KEY]: { label: "Note", text: noteLabel || "Untitled note" },
  });
  const folder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const tags = useAppSelector(selectNoteTags(noteId));
  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const isSaving = useAppSelector(selectNoteIsSavingById(noteId));
  const editingActorId = useAppSelector((state) => state.userAuth.id);

  // The body is the NOTE'S working copy, shared with every other view of
  // this note and committed to Redux once per debounce (useNoteWorkingCopy).
  const workingCopy = useNoteWorkingCopy(noteId, reduxContent);
  const localContent = workingCopy.content;
  const localContentRef = useRef(localContent);
  const noteIdRef = useRef(noteId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The phone's Plain textarea joins the ONE formatting command layer
  // (chords + the docked selection toolbar's formatting buttons).
  const [formatElement, setFormatElement] = useState<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    if (textareaRef.current !== formatElement) setFormatElement(textareaRef.current);
  });
  useTextareaFormatting(formatElement, !readOnly);
  // THE ONE EDITOR (Write / Source).
  const richRef = useRef<RichEditorController | null>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);
  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);

  const displayedNote = useMemo(
    () => (record ? { ...record, content: localContent } : null),
    [record, localContent],
  );
  const editableContentSource = usePreparedNoteContentSource(
    displayedNote && record?._acknowledgedPhysicalSnapshot && editingActorId && !readOnly
      ? {
          record,
          displayedNote,
          actorId: editingActorId,
          hasLocalEdits: isDirty || record._dirty || localContent !== (record.content ?? ""),
        }
      : null,
  );

  // The delete confirmation belongs to the platform, not to this screen —
  // `requestDelete` opens the canonical `confirm()` (see useNoteDelete).
  const { isDeleting, requestDelete } = useNoteDelete({
    instanceId: "",
    noteId,
    noteLabel: noteLabel || "Untitled Note",
    content: localContent,
    closeTab: false,
    onDeleted: onBack,
  });

  // ── Note switch: adopt the newly selected note's stored content ─────
  // Render-phase reset (React's "adjusting state when a prop changes"): an
  // effect here would leave one frame showing the previous note's buffer.
  const [syncedNoteId, setSyncedNoteId] = useState(noteId);
  if (syncedNoteId !== noteId) {
    setSyncedNoteId(noteId);
  }

  const handleChange = useCallback(
    (content: string) => {
      // The ref moves with the keystroke, not a render later: a mode switch's
      // flush (below) can run before the next render and must see this text.
      localContentRef.current = content;
      workingCopy.edit(content);
      // This note reopens in the mode the person typed in (plain stays plain).
      rememberEditedMode(noteId, effectiveMode);
    },
    [noteId, workingCopy, rememberEditedMode, effectiveMode],
  );

  const handleChangeFlush = useCallback(
    (content: string) => {
      localContentRef.current = content;
      workingCopy.editNow(content);
    },
    [workingCopy],
  );

  /** The one editor's text now (pending keystrokes delivered), when it is the body. */
  const readMountedContent = useCallback(() => {
    if (!richMode) return localContentRef.current;
    try {
      return richRef.current?.flush() ?? localContentRef.current;
    } catch {
      return localContentRef.current;
    }
  }, [richMode]);

  // TYPE, TAP BACK, GONE — closed at the class. The note's working copy
  // commits pending words when its last view detaches (an unmount, a note
  // switch releases the OUTGOING note), exactly as for `NoteContentEditor`;
  // its save persists it. On a TRUE unmount in Write / Source,
  // the one editor may hold words its onChange has not delivered yet. A
  // layout-effect cleanup runs before the child editor detaches its imperative
  // handle (and before the passive release), so the live markdown joins the
  // working copy here. Never on a note switch: by then the rich editor may
  // already show the NEXT note.
  const effectiveModeRef = useRef(effectiveMode);
  useEffect(() => {
    effectiveModeRef.current = effectiveMode;
  }, [effectiveMode]);
  /** Set by the one editor's own onChange. It reports only real edits (its
   *  no-edit text is the stored bytes), and the unmount snapshot is still
   *  taken ONLY when the person typed there — opening a note never writes it. */
  const richEditedRef = useRef(false);
  useLayoutEffect(
    () => () => {
      if (!isRichEditorMode(effectiveModeRef.current) || !richEditedRef.current) return;
      try {
        const markdown = richRef.current?.flush();
        // Into the note's working copy while this view still holds it (layout
        // cleanups run before the passive release, which commits it).
        if (typeof markdown === "string" && markdown !== localContentRef.current) {
          localContentRef.current = markdown;
          noteWorkingCopy.edit(noteIdRef.current, markdown);
        }
      } catch {
        // A torn-down rich editor falls back to the last delivered buffer.
      }
    },
    [],
  );

  useEffect(() => {
    // A fresh note has not been edited in rich mode yet.
    richEditedRef.current = false;
  }, [noteId]);

  // Leaving the one editor commits whatever it holds (it delivers its last
  // keystrokes as it unmounts; this pushes them to Redux at once).
  const previousModeRef = useRef(effectiveMode);
  useEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = effectiveMode;
    if (previous === effectiveMode || !isRichEditorMode(previous)) return;
    workingCopy.flush();
  }, [effectiveMode, workingCopy]);

  // Auto-grow plain textarea
  const growTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (effectiveMode === "plain") growTextarea();
  }, [localContent, effectiveMode, growTextarea]);

  // Report dirty state so refreshNotes() never overwrites unsaved user input.
  useEffect(() => {
    setActiveNoteDirty(isDirty);
    return () => {
      setActiveNoteDirty(false);
    };
  }, [isDirty, setActiveNoteDirty]);

  const handleSave = useCallback(async () => {
    handleChangeFlush(readMountedContent());
    try {
      await dispatch(saveNote(noteId)).unwrap();
    } catch {
      // `saveNote` owns failure classification/capture; keep this derived
      // notice visible without filing a duplicate, context-free system_error.
      toastErrorAlreadyCaptured("Failed to save note");
    }
  }, [dispatch, handleChangeFlush, noteId, readMountedContent]);

  // Expose save state and handler to parent (MobileNotesView injects into header)
  useEffect(() => {
    window.__mobileNoteEditorState = { isDirty, isSaving, handleSave };
    return () => {
      delete window.__mobileNoteEditorState;
    };
  });

  const handleCopy = async () => {
    try {
      await copyNote(noteId);
      toast.success("Note duplicated");
    } catch {
      toast.error("Failed to duplicate note");
    }
  };

  const handleExport = () => {
    const content = readMountedContent();
    const blob = new Blob([content], { type: "text/markdown" });
    downloadFile(`${noteLabel || "note"}.md`, blob, blob.type);
    toast.success("Exported");
  };

  // ── The `matrx-user/notes` surface runtime (W-69) ────────────────────
  // THE SAME hook the desktop editor uses: the header's Intelligence → Run,
  // the long-press menu and every agent launched from this note on a phone
  // carry the note's full scope and its five write targets — never an empty
  // scope and a toast saying so.
  const instanceId = useOptionalNotesInstanceId();
  const {
    surfaceContextData,
    getApplicationScope,
    getWriteHandlers,
  } = useNotesSurfaceRuntime({
    instanceId,
    noteId,
    content: localContent,
    contentRef: localContentRef,
    textareaRef,
    richEditorRef: richRef,
    richMode,
    editorMode: effectiveMode,
    readOnly,
    accessLoading: access.loading,
    applyContent: handleChangeFlush,
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getApplicationScope}
      isEditable={!readOnly}
      getWriteHandlers={getWriteHandlers}
    >
    {/* Flex column fills the parent — content scrolls, dock stays at bottom */}
    <div ref={editorRootRef} className="h-full bg-background flex flex-col overflow-hidden relative">
      {readOnly && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs truncate">
            Read-only — shared with view access
            {access.ownerEmail ? ` by ${access.ownerEmail}` : ""}.
          </span>
        </div>
      )}

      {/* Loud recovery, in the same priority order as desktop: work that is
          failing to save blocks first, then work already rescued to a draft. */}
      <NoteSaveFailureBanner noteId={noteId} />
      {!readOnly && (
        <NoteDraftRecoveryBanner noteId={noteId} onRestore={handleChangeFlush} />
      )}

      {/* The note's working copy: Keep mine / Take theirs / Merge, or Retry / Discard. */}
      <NoteWorkingCopyAlert noteId={noteId} className="shrink-0" />

      {/* ── Write: THE ONE EDITOR, the same one desktop uses ─────────────────
          It scrolls itself (its text keeps clear of the dock), so it sits
          outside the padded scroll area. The note's own menu answers
          long-press, as in Plain. */}
      {richMode && (
        <EditableContextMenu
          sourceFeature="notes"
          surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
          resolveContextOnOpen={noteMenuHeading}
          contextData={surfaceContextData}
          contentSource={editableContentSource}
          entity={{
            type: "note",
            id: noteId,
            title: noteLabel || note.label,
            resourceType: "note",
          }}
          insertAtCaret={(text, placement) =>
            insertAtRichCaret(richRef.current, text, placement)
          }
          onTextReplace={handleChangeFlush}
          onTextInsertBefore={(text) => richRef.current?.insertText(text, "before")}
          onTextInsertAfter={(text) => richRef.current?.insertText(text, "after")}
        >
          {/* One text inset on a phone: Plain's 16px, not the editor's 32px. */}
          <div className="relative min-h-0 flex-1 [&_.ProseMirror]:px-4! [&_.ProseMirror_ul]:pl-6! [&_.ProseMirror_ol]:pl-6! [&_.ProseMirror_li]:pl-0!">
            <RichEditor
              key={noteId}
              value={localContent}
              onChange={(value: string) => {
                richEditedRef.current = true;
                handleChange(value);
              }}
              view="visual"
              chrome="bare"
              hostContextMenu
              controllerRef={richRef}
              surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
              sourceFeature="notes"
              contentSource={editableContentSource ?? noteIdentityContentSource(noteId, `mobile-editor:${noteId}`)}
              defaultOutlineOpen={false}
              placeholder="Start writing..."
              imagePolicy={authoredBy(note.created_by, editingActorId)}
              className="h-full"
            />
          </div>
        </EditableContextMenu>
      )}

      {/* ── Scrollable content area (Plain / a viewer's Read) ─────────────── */}
      <div className={cn("flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-32", richMode && "hidden")}>
        {/* Plain text — wrapped in the universal v3 menu: on mobile it mounts
            the long-press / selection-icon bottom-sheet drill-down, giving the
            phone editor the same Copy-as / Export / AI / agent actions as
            desktop. Read-only access never reaches Plain: a viewer reads the
            rendered note (effectiveMode → preview, round 6 R6). */}
        {effectiveMode === "plain" && !readOnly && (
          <EditableContextMenu
            sourceFeature="notes"
            surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
            resolveContextOnOpen={noteMenuHeading}
            contextData={surfaceContextData}
            contentSource={editableContentSource}
            entity={{
              type: "note",
              id: noteId,
              title: noteLabel || note.label,
              resourceType: "note",
            }}
            getTextarea={() => textareaRef.current}
            onTextReplace={(next) => {
              handleChangeFlush(next);
              growTextarea();
            }}
          >
            <textarea
              ref={textareaRef}
              data-kind-source="explicit"
              value={localContent}
              onChange={(e) => {
                handleChange(e.target.value);
                growTextarea();
              }}
              placeholder="Start writing..."
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground outline-none border-none resize-none leading-relaxed"
              style={{ fontSize: "16px", minHeight: "calc(100dvh - 200px)" }}
            />
          </EditableContextMenu>
        )}


        {/* Preview */}
        {effectiveMode === "preview" && (
          // The note is this content's record: its menu offers Attach To and
          // Share for the note, as the desktop note's one menu does (R26).
          <div
            className="min-h-[calc(100dvh-200px)] prose prose-sm dark:prose-invert max-w-none"
            data-entity-type="note"
            data-entity-id={noteId}
            data-entity-title={noteLabel || note.label}
            data-entity-resource="note"
          >
            {localContent.trim() ? (
              // EDIT IN PLACE: a double-tap on the text opens the one editor
              // here, autosaving through the note's working copy.
              <EditInPlace
                value={localContent}
                canEdit={!readOnly}
                mode="autosave"
                write={(text) => handleChange(text)}
                discardDescription="The note goes back to how it was when you opened the editor."
                editor={{
                  imagePolicy: authoredBy(note.created_by, editingActorId),
                  surfaceName: "matrx-user/notes",
                  sourceFeature: "notes",
                  contentSource: editableContentSource ?? noteIdentityContentSource(noteId, `mobile-preview:${noteId}`),
                }}
              >
              <RichDocument imagePolicy={authoredBy(note.created_by, editingActorId)}
                content={localContent}
                source={editableContentSource ?? noteIdentityContentSource(noteId, `mobile-preview:${noteId}`)}
                actionsVariant="mini-bar"
                actionsClassName="mb-2"
                allowFullScreenEditor={false}
                actions={{ exclude: NOTE_EXCLUDED_ACTIONS }}
              />
              </EditInPlace>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing to preview yet.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Fixed bottom dock ────────────────────────────────────────────────── */}
      <NoteEditorDock
        formatResolve={effectiveMode !== "preview" && !readOnly ? () => formatTargetWithin(editorRootRef.current) : null}
        noteId={noteId}
        noteLabel={noteLabel}
        readOnly={readOnly}
        folder={folder}
        organizationId={note.organization_id}
        tags={tags}
        content={localContent}
        onFolderChange={async (nextFolder) => {
          await moveNote(noteId, nextFolder);
        }}
        onCreateFolder={async (folderName) => {
          await moveNoteToNewFolder(noteId, folderName);
        }}
        onTagsChange={(nextTags) =>
          dispatch(updateNoteTags({ id: noteId, tags: nextTags }))
        }
        onDuplicate={handleCopy}
        onExport={handleExport}
        onDelete={requestDelete}
        onRename={(nextLabel) => {
          if (nextLabel) dispatch(updateNoteLabel({ id: noteId, label: nextLabel }));
        }}
        isDeleting={isDeleting}
      />
    </div>
    </SurfaceRuntimeProvider>
  );
}
