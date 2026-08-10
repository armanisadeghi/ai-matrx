"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllNotesList,
  selectAllFolders,
  selectNotesListStatus,
  selectNotesByFolder,
} from "@/features/notes/redux/selectors";
import {
  fetchNotesList,
  createNewNote,
  saveNoteField,
} from "@/features/notes/redux/thunks";
import type { Note } from "@/features/notes/types";
import type { NoteRecord } from "@/features/notes/redux/notes.types";
import { useToastManager } from "@/hooks/useToastManager";
import {
  useRefinableContent,
  type RefinableContent,
} from "@/components/content-refine/useRefinableContent";
import { payloadSafetyStore } from "@/lib/persistence/payloadSafetyStore";
import { runTrackedRequest } from "@/lib/redux/net/runTrackedRequest";

// Vocabulary lives in a pure module so the surface manifest can import the
// same constants this hook validates against (see quickNoteSaveVocabulary).
export type { SaveMode, UpdateMethod } from "./quickNoteSaveVocabulary";
import type { SaveMode, UpdateMethod } from "./quickNoteSaveVocabulary";

export interface UseQuickNoteSaveArgs {
  initialContent: string;
  defaultFolder?: string;
  /** Pre-filled note title (e.g. chat save: "My topic Message 4"). */
  defaultNoteName?: string;
}

function buildTimestampNoteName(): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `Quick Note - ${date} at ${time}`;
}

export function useQuickNoteSave({
  initialContent: rawInitialContent,
  defaultFolder = "Scratch",
  defaultNoteName: initialNoteName,
}: UseQuickNoteSaveArgs) {
  const dispatch = useAppDispatch();
  const toast = useToastManager("notes");

  // Content transforms (strip-thinking, trim, edit override) live in the
  // shared refine primitive (it coerces null/undefined content at the
  // boundary); this hook owns only the note-destination state.
  const refine: RefinableContent = useRefinableContent({
    initialContent: rawInitialContent,
  });
  const { workingContent, initialContent } = refine;

  const allNotes = useAppSelector(selectAllNotesList);
  const foldersFromRedux = useAppSelector(selectAllFolders);
  const allFolders = useMemo(() => {
    if (!defaultFolder || foldersFromRedux.includes(defaultFolder)) {
      return foldersFromRedux;
    }
    return [defaultFolder, ...foldersFromRedux];
  }, [foldersFromRedux, defaultFolder]);
  const listStatus = useAppSelector(selectNotesListStatus);

  useEffect(() => {
    if (listStatus === "idle" || listStatus === "error") {
      dispatch(fetchNotesList());
    }
  }, [listStatus, dispatch]);

  // Target fields
  const [noteName, setNoteName] = useState(
    () => initialNoteName?.trim() || buildTimestampNoteName(),
  );
  const [folder, setFolder] = useState(defaultFolder);
  const [mode, setMode] = useState<SaveMode>("create");
  // Selection is stored WITH the folder+mode it was made under; changing
  // either invalidates it by derivation (no setState-in-effect reset).
  const [selection, setSelection] = useState<{
    folder: string;
    mode: SaveMode;
    id: string;
  } | null>(null);
  const selectedNoteId =
    selection && selection.folder === folder && selection.mode === mode
      ? selection.id
      : "";
  const setSelectedNoteId = useCallback(
    (id: string) => setSelection(id ? { folder, mode, id } : null),
    [folder, mode],
  );
  const [updateMethod, setUpdateMethod] = useState<UpdateMethod>("append");

  // Save lifecycle
  const [isSaving, setIsSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<Note | null>(null);

  const notesInFolder = useAppSelector(selectNotesByFolder(folder));

  const selectedNote: NoteRecord | undefined = useMemo(
    () => allNotes.find((n) => n.id === selectedNoteId),
    [allNotes, selectedNoteId],
  );

  const save = useCallback(async (): Promise<Note | null> => {
    if (!workingContent.trim()) {
      toast.error("Content cannot be empty");
      return null;
    }

    if (mode === "update" && (!selectedNoteId || !selectedNote)) {
      toast.error("Please select a note to update");
      return null;
    }
    // Narrowed once, here — `selectedNote` is proven defined in update mode by
    // the guard above, but that guard is in `save`'s outer scope while the
    // read below happens inside a nested `run` closure, which TS can't narrow
    // through. Capture the checked value instead of re-asserting it later.
    const selectedNoteForUpdate = mode === "update" ? selectedNote : undefined;

    const requestId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const trimmedContent = workingContent.trim();
    const isCreate = mode === "create";
    const label = isCreate
      ? `Note: ${noteName.trim() || "Quick Note"}`
      : `Note update: ${selectedNote?.label || "note"}`;
    const routeHref =
      typeof window !== "undefined" ? window.location.pathname : "/notes";

    const payload = isCreate
      ? {
          op: "create" as const,
          label: noteName.trim() || "Quick Note",
          content: trimmedContent,
          folder_name: folder,
        }
      : {
          op: "update" as const,
          noteId: selectedNoteId,
          updateMethod,
          content: trimmedContent,
        };

    const recoveryId = await payloadSafetyStore
      .savePending({
        id: requestId,
        kind: "note",
        label,
        routeHref,
        payload,
        rawUserInput: initialContent,
      })
      .catch(() => requestId);

    setIsSaving(true);
    try {
      const result = await runTrackedRequest<Note>(dispatch, {
        id: requestId,
        kind: "crud",
        label,
        recoveryId,
        run: async () => {
          if (isCreate) {
            const note = await dispatch(
              createNewNote({
                label: noteName.trim() || "Quick Note",
                content: trimmedContent,
                folder_name: folder,
                tags: [],
              }),
            ).unwrap();
            return note;
          }

          if (!selectedNoteForUpdate) {
            throw new Error("No note selected to update");
          }

          const finalContent =
            updateMethod === "append"
              ? `${selectedNoteForUpdate.content ?? ""}\n\n${trimmedContent}`.trim()
              : trimmedContent;

          await dispatch(
            saveNoteField({
              noteId: selectedNoteId,
              field: "content",
              value: finalContent,
            }),
          ).unwrap();

          return {
            ...selectedNoteForUpdate,
            content: finalContent,
          };
        },
      });

      if (isCreate) {
        toast.success(`Created in ${folder}!`);
      } else {
        toast.success(
          `Content ${updateMethod === "append" ? "appended to" : "overwrote"} ${
            selectedNote?.label || "note"
          }!`,
        );
      }
      setSavedNote(result);
      return result;
    } catch (err) {
      console.error("QuickNoteSave: save failed", err);
      toast.error("Failed to save — saved to Recovery");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [
    dispatch,
    toast,
    mode,
    noteName,
    folder,
    workingContent,
    initialContent,
    selectedNoteId,
    selectedNote,
    updateMethod,
  ]);

  const reset = useCallback(() => {
    refine.resetTransforms();
    setNoteName(initialNoteName?.trim() || buildTimestampNoteName());
    setFolder(defaultFolder);
    setMode("create");
    setSelectedNoteId("");
    setUpdateMethod("append");
    setSavedNote(null);
    setIsSaving(false);
  }, [defaultFolder, initialNoteName, refine]);

  const isSaveDisabled =
    isSaving ||
    !workingContent.trim() ||
    (mode === "update" && !selectedNoteId);

  return {
    // content transforms — the shared refine primitive, also spread flat for
    // consumers that predate it. New consumers: hand `refine` to
    // <RefinableContentEditor> instead of rebuilding toolbar/trim UI.
    refine,
    ...refine,

    // targets
    noteName,
    setNoteName,
    folder,
    setFolder,
    mode,
    setMode,
    selectedNoteId,
    setSelectedNoteId,
    updateMethod,
    setUpdateMethod,
    selectedNote,

    // data
    allFolders,
    notesInFolder,

    // lifecycle
    isSaving,
    isSaveDisabled,
    savedNote,
    save,
    reset,
  };
}
