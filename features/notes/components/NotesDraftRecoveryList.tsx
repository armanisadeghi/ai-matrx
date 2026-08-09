"use client";

/**
 * NotesDraftRecoveryList — the surface-level half of draft recovery.
 *
 * `NoteDraftRecoveryBanner` can only offer a draft back once its note is
 * OPEN. The worst case from D132 is the opposite one: a note whose very first
 * INSERT was rejected has no server row, so it appears in no list, no sidebar
 * and no tab — the user has no way to even know their text still exists. That
 * note was declared unrecoverable on 2026-08-08.
 *
 * This strip lists every recovered draft for the signed-in user that is not
 * already open, and gives each one a real door: open the note it belongs to,
 * or — when the note never reached the database — recover it as a new note.
 */

import { useCallback, useState } from "react";
import { LifeBuoy, Trash2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import {
  addInstanceTab,
  setInstanceActiveTab,
  markTabInteraction,
} from "../redux/slice";
import { createNewNote, fetchNoteContent } from "../redux/thunks";
import {
  selectInstanceTabs,
  selectNotesMap,
} from "../redux/selectors";
import { discardNoteDraft, listNoteDrafts } from "../utils/notesDrafts";
import type { LocalDraft } from "@/lib/local-drafts/types";

interface NotesDraftRecoveryListProps {
  instanceId: string;
}

export function NotesDraftRecoveryList({
  instanceId,
}: NotesDraftRecoveryListProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.userAuth.id);
  const notesMap = useAppSelector(selectNotesMap);
  const openTabs = useAppSelector(selectInstanceTabs(instanceId));
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [readFor, setReadFor] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Read once per user, during render rather than in an effect: the draft
  // store only changes on a capture (a page we are about to leave) or on an
  // action taken right here, so re-reading costs renders and buys nothing.
  if (readFor !== (userId ?? "")) {
    setReadFor(userId ?? "");
    setDrafts(listNoteDrafts(userId ?? null));
  }

  const drop = useCallback((entityId: string) => {
    discardNoteDraft(entityId);
    setDrafts((current) => current.filter((d) => d.entityId !== entityId));
  }, []);

  const pending = drafts.filter((d) => !(openTabs ?? []).includes(d.entityId));
  if (pending.length === 0) return null;

  const handleOpen = (draft: LocalDraft) => {
    dispatch(markTabInteraction({ instanceId }));
    dispatch(addInstanceTab({ instanceId, noteId: draft.entityId }));
    dispatch(setInstanceActiveTab({ instanceId, noteId: draft.entityId }));
    dispatch(fetchNoteContent(draft.entityId));
  };

  const handleRecoverAsNew = async (draft: LocalDraft) => {
    setBusyKey(draft.key);
    try {
      const created = await dispatch(
        createNewNote({
          label: draft.label || "Recovered note",
          content: draft.content,
        }),
      ).unwrap();
      drop(draft.entityId);
      dispatch(markTabInteraction({ instanceId }));
      dispatch(addInstanceTab({ instanceId, noteId: created.id }));
      dispatch(setInstanceActiveTab({ instanceId, noteId: created.id }));
      toast.success("Recovered as a new note.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not recover this note: ${error.message}`
          : "Could not recover this note.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="shrink-0 border-b border-primary/40 bg-primary/10 px-3 py-2">
      <div className="flex items-center gap-2 pb-1">
        <LifeBuoy className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-xs font-medium text-foreground">
          {pending.length === 1
            ? "1 unsaved note was recovered from this browser"
            : `${pending.length} unsaved notes were recovered from this browser`}
        </span>
      </div>
      <ul className="space-y-1">
        {pending.map((draft) => {
          const exists = Boolean(notesMap[draft.entityId]);
          return (
            <li
              key={draft.key}
              className="flex items-center gap-2 rounded-md bg-card/60 px-2 py-1"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                {draft.label || "Untitled note"}
                <span className="ml-2 text-muted-foreground">
                  {draft.content.length.toLocaleString()} characters
                  {exists ? "" : " · never saved to the server"}
                </span>
              </span>
              {exists ? (
                <button
                  type="button"
                  onClick={() => handleOpen(draft)}
                  className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
                >
                  Open note
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRecoverAsNew(draft)}
                  disabled={busyKey === draft.key}
                  className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
                >
                  {busyKey === draft.key ? "Recovering…" : "Recover as new note"}
                </button>
              )}
              <button
                type="button"
                onClick={() => drop(draft.entityId)}
                title="Discard this recovered copy"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
