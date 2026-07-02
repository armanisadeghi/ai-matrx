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
import { stripThinking, hasThinkingTags } from "./utils/stripThinking";
import { applyTrim } from "./utils/trimContent";
import { payloadSafetyStore } from "@/lib/persistence/payloadSafetyStore";
import { runTrackedRequest } from "@/lib/redux/net/runTrackedRequest";

export type SaveMode = "create" | "update";
export type UpdateMethod = "append" | "overwrite";

export interface UseQuickNoteSaveArgs {
  initialContent: string;
  defaultFolder?: string;
}

function defaultNoteName(): string {
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
}: UseQuickNoteSaveArgs) {
  // Coerce to string at the boundary — every call below (`.length`, `.trim()`,
  // `applyTrim`, `stripThinking`, persistence payload) assumes a string.
  // A null/undefined leak from a parent (overlay data, stale props) would
  // crash the editor on mount otherwise.
  const initialContent =
    typeof rawInitialContent === "string" ? rawInitialContent : "";
  const dispatch = useAppDispatch();
  const toast = useToastManager("notes");

  const allNotes = useAppSelector(selectAllNotesList);
  const allFolders = useAppSelector(selectAllFolders);
  const listStatus = useAppSelector(selectNotesListStatus);

  useEffect(() => {
    if (listStatus === "idle" || listStatus === "error") {
      dispatch(fetchNotesList());
    }
  }, [listStatus, dispatch]);

  // Transform flags
  const [stripThinkingEnabled, setStripThinkingEnabled] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // User-editable override of the working content (after transforms).
  // null = derive from initialContent + transforms; string = user has edited.
  const [editedContent, setEditedContent] = useState<string | null>(null);

  // Trim is applied to the raw input first; other transforms (strip-thinking, etc)
  // then operate on the trimmed slice.
  const basePostTransform = useMemo(() => {
    const trimmed = applyTrim(initialContent, trimStart, trimEnd);
    return stripThinkingEnabled ? stripThinking(trimmed) : trimmed;
  }, [initialContent, stripThinkingEnabled, trimStart, trimEnd]);

  const workingContent = editedContent ?? basePostTransform;

  // Reset edited content when source transforms change
  useEffect(() => {
    setEditedContent(null);
  }, [initialContent, stripThinkingEnabled, trimStart, trimEnd]);

  // Trim sliders operate on the original content length.
  const maxTrim = initialContent.length;

  // Target fields
  const [noteName, setNoteName] = useState(defaultNoteName());
  const [folder, setFolder] = useState(defaultFolder);
  const [mode, setMode] = useState<SaveMode>("create");
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [updateMethod, setUpdateMethod] = useState<UpdateMethod>("append");

  // Save lifecycle
  const [isSaving, setIsSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<Note | null>(null);

  // Reset selection when folder or mode changes
  useEffect(() => {
    setSelectedNoteId("");
  }, [folder, mode]);

  const notesInFolder = useAppSelector(selectNotesByFolder(folder));

  const selectedNote: NoteRecord | undefined = useMemo(
    () => allNotes.find((n) => n.id === selectedNoteId),
    [allNotes, selectedNoteId],
  );

  const canStripThinking = hasThinkingTags(initialContent);

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
    setStripThinkingEnabled(false);
    setTrimStart(0);
    setTrimEnd(0);
    setEditedContent(null);
    setNoteName(defaultNoteName());
    setFolder(defaultFolder);
    setMode("create");
    setSelectedNoteId("");
    setUpdateMethod("append");
    setSavedNote(null);
    setIsSaving(false);
  }, [defaultFolder]);

  const isSaveDisabled =
    isSaving ||
    !workingContent.trim() ||
    (mode === "update" && !selectedNoteId);

  return {
    // content + transforms
    workingContent,
    setEditedContent,
    stripThinkingEnabled,
    setStripThinkingEnabled,
    canStripThinking,
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
    maxTrim,

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
