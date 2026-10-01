"use client";

/**
 * THE NOTES SURFACE RUNTIME — the read AND write half of `matrx-user/notes`,
 * ONE copy for every editor that shows a note.
 *
 * 🚨 WHY (PB-08 dry run, W-69, 2026-10-01). The desktop editor
 * (`NoteContentEditor`) built its scope and its five write targets inline and
 * mounted `SurfaceRuntimeProvider`; the phone editor (`MobileNoteEditor`) is a
 * separate component and mounted nothing. So on a phone the header's
 * Intelligence → Run found no live runtime, launched with an EMPTY
 * application scope ("Running without live page context"), and the agent
 * listed all 141 notes to find the one on screen; its long-press menu handed
 * agents `{ content }` and nothing else. Both editors now take their scope,
 * their application scope and their write handlers from here, so a phone run
 * carries exactly what a desktop run carries. Guard:
 * `features/notes/components/mobile/MobileNoteEditor.surfaceRuntime.test.tsx`.
 *
 * Writes are NOT a parallel path: content goes through the caller's
 * `applyContent` (its own flush into `updateNoteContent`), title/tags through
 * the slice actions the person's typing dispatches, the folder through
 * `moveNoteToFolder`. Every handler validates and THROWS on a bad shape — the
 * writeback seam turns a throw into an error envelope the agent can correct.
 * A read-only note (viewer-level sharee, or access still loading) registers
 * no note-body handlers, so the seam never advertises a write RLS rejects.
 */

import { useCallback, useMemo, type RefObject } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RichEditorController } from "@/components/rich-editor/RichEditor";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";
import { useNotesSurfaceScope } from "@/features/notes/hooks/useNotesSurfaceScope";
import { useNotesCollectionWriteHandlers } from "@/features/notes/agent-context/useNotesCollectionWriteHandlers";
import { selectFolderReferences, selectNoteById } from "@/features/notes/redux/selectors";
import { updateNoteLabel, updateNoteTags } from "@/features/notes/redux/slice";
import { moveNoteToFolder } from "@/features/notes/redux/thunks";

export interface UseNotesSurfaceRuntimeParams {
  /** NotesView instance id — tabs / split / find state. Optional off-view. */
  instanceId?: string;
  noteId: string;
  /** Live body buffer (the editor's `localContent`). */
  content: string;
  /** Always-current body — read by `append_to_note` at write time. */
  contentRef: RefObject<string>;
  /** Plain-mode textarea — selection is read live from the DOM. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** The one editor (Write / Source) — owns its selection when mounted. */
  richEditorRef: RefObject<RichEditorController | null>;
  /** True when the body showing is the rich editor. */
  richMode: boolean;
  editorMode: EditorMode;
  readOnly: boolean;
  accessLoading: boolean;
  /** Replace the whole body through the editor's own flush path. */
  applyContent: (content: string) => void;
}

export function useNotesSurfaceRuntime({
  instanceId,
  noteId,
  content,
  contentRef,
  textareaRef,
  richEditorRef,
  richMode,
  editorMode,
  readOnly,
  accessLoading,
  applyContent,
}: UseNotesSurfaceRuntimeParams) {
  const dispatch = useAppDispatch();
  const record = useAppSelector(selectNoteById(noteId));
  const folderReferences = useAppSelector(selectFolderReferences);
  const organizationId = record?.organization_id ?? null;

  const buildSurfaceScope = useNotesSurfaceScope({
    instanceId,
    noteId,
    content,
    textareaRef,
    editorMode,
  });

  // Memoized snapshot for a context menu's `contextData` prop — never build
  // the O(all-notes) scope inline in JSX (the 2026-07 keystroke-freeze class).
  const surfaceContextData = useMemo(
    () => buildSurfaceScope() as Record<string, unknown>,
    [buildSurfaceScope],
  );

  const getApplicationScope = useCallback(() => {
    const rich = richMode ? richEditorRef.current : null;
    if (rich) {
      return buildApplicationScopeFromMenuContext({
        selectedText: rich.selectedText(),
        selectionRange: null,
        contextData: buildSurfaceScope() as Record<string, unknown>,
      });
    }
    const el = textareaRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const selectedText =
      el && start !== end
        ? el.value.slice(Math.min(start, end), Math.max(start, end))
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el ? { type: "editable", element: el, start, end } : null,
      contextData: buildSurfaceScope() as Record<string, unknown>,
    });
  }, [buildSurfaceScope, richMode, richEditorRef, textareaRef]);

  const getCollectionWriteHandlers = useNotesCollectionWriteHandlers({
    instanceId: instanceId ?? "",
    folders: folderReferences,
    activeNoteId: noteId,
    activeOrganizationId: organizationId,
    readOnly: accessLoading || readOnly,
  });

  const availableFolders = folderReferences.filter(
    (folder) => folder.organizationId === organizationId,
  );

  const getWriteHandlers = (): SurfaceWriteHandlers => {
    if (accessLoading) return {};
    if (readOnly) return getCollectionWriteHandlers();
    return {
      ...getCollectionWriteHandlers(),
      note_content: (value: unknown) => {
        if (typeof value !== "string")
          throw new Error("note_content expects a string (the full note body).");
        applyContent(value);
      },
      append_to_note: (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error(
            "append_to_note expects a non-empty string to add to the end of the note.",
          );
        const base = contentRef.current ?? "";
        applyContent(base.trim() ? `${base}\n\n${value}` : value);
      },
      note_title: (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error("note_title expects a non-empty string.");
        if (/[\r\n]/.test(value))
          throw new Error("note_title expects a single line — no line breaks.");
        dispatch(updateNoteLabel({ id: noteId, label: value.trim() }));
      },
      note_tags: (value: unknown) => {
        if (
          !Array.isArray(value) ||
          !value.every((tag) => typeof tag === "string" && tag.trim())
        )
          throw new Error(
            "note_tags expects an array of non-empty strings (the FULL tag set — it replaces the existing tags).",
          );
        dispatch(
          updateNoteTags({
            id: noteId,
            tags: (value as string[]).map((tag) => tag.trim()),
          }),
        );
      },
      note_folder: async (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error("note_folder expects a folder name string.");
        const folder = value.trim();
        // Refuse an unknown name: `moveNoteToFolder` creates-or-gets, so an
        // invented name would silently add a folder. Creating folders is the
        // person's decision.
        const targetFolder = availableFolders.find(
          (candidate) => candidate.name === folder,
        );
        if (!targetFolder)
          throw new Error(
            // access-errors: ok — AI tool-call validation against the loaded folder list; the name is verifiably absent from it
            `note_folder expects an existing folder. "${folder}" does not exist — choose one of: ${availableFolders.map((candidate) => candidate.name).join(" | ")}.`,
          );
        await dispatch(moveNoteToFolder({ noteId, folder: targetFolder })).unwrap();
      },
    };
  };

  return {
    buildSurfaceScope,
    surfaceContextData,
    getApplicationScope,
    getWriteHandlers,
  };
}
