// features/war-room/hooks/useThreadEntitySelect.ts
//
// War-room bindings of the canonical AssociationEntitySelect adapter — the
// thread tabs have their OWN active semantics (the is_active flag on the
// association edge, single-active per entity type) and their own create
// pipelines (notes autosave middleware, studio-session source stamping), so
// they implement the adapter instead of using the generic
// useAssociationEntitySelectAdapter.
//
//   useThreadNoteSelectAdapter          — the Notes tab's notes
//   useThreadAudioSessionSelectAdapter  — the Audio/Agent tabs' studio sessions

"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { AssociationEntitySelectAdapter } from "@/features/scopes/components/associations/AssociationEntitySelect";
import { primeEntityTitle } from "@/features/scopes/service/entityTitles";
import { selectNotesMap } from "@/features/notes/redux/selectors";
import { update as updateNoteApi } from "@/features/notes/service/notesApi";
import { upsertNoteFromServer } from "@/features/notes/redux/slice";
import { selectSessionsById } from "@/features/transcript-studio/redux/selectors";
import { updateSessionThunk } from "@/features/transcript-studio/redux/thunks";
import {
  selectActiveAudioSessionId,
  selectActiveNoteId,
  selectAudioSessionIdsForThread,
  selectContainerAssignmentsLoaded,
  selectNoteIdsForThread,
} from "@/features/war-room/redux/selectors";
import {
  addAudioSessionToThread,
  addNoteToThread,
  removeEntityFromThread,
  setThreadActiveAudioSession,
  setThreadActiveNote,
} from "@/features/war-room/redux/thunks";

export function useThreadNoteSelectAdapter(
  threadId: string,
  roomId: string,
): AssociationEntitySelectAdapter {
  const dispatch = useAppDispatch();
  const loaded = useAppSelector(
    selectContainerAssignmentsLoaded("thread", threadId),
  );
  const noteIds = useAppSelector(selectNoteIdsForThread(threadId));
  const activeId = useAppSelector(selectActiveNoteId(threadId));
  const notesById = useAppSelector(selectNotesMap);

  return {
    loading: !loaded,
    items: noteIds.map((id, i) => ({
      id,
      title: notesById[id]?.label?.trim() || `Note ${i + 1}`,
    })),
    activeId,
    setActive: (id) => dispatch(setThreadActiveNote(threadId, id)),
    createAndAttach: (title) =>
      dispatch(addNoteToThread(threadId, roomId, title)),
    rename: async (id, title) => {
      try {
        const note = await updateNoteApi(id, { label: title.trim() });
        dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
        primeEntityTitle("note", id, title);
        return true;
      } catch (err) {
        console.error("[useThreadNoteSelectAdapter] rename failed", {
          id,
          err,
        });
        return false;
      }
    },
    detach: (id) => dispatch(removeEntityFromThread(threadId, "note", id)),
  };
}

export function useThreadAudioSessionSelectAdapter(
  threadId: string,
): AssociationEntitySelectAdapter {
  const dispatch = useAppDispatch();
  const loaded = useAppSelector(
    selectContainerAssignmentsLoaded("thread", threadId),
  );
  const sessionIds = useAppSelector(selectAudioSessionIdsForThread(threadId));
  const activeId = useAppSelector(selectActiveAudioSessionId(threadId));
  const sessionsById = useAppSelector(selectSessionsById);

  return {
    loading: !loaded,
    items: sessionIds.map((id, i) => ({
      id,
      // Real session title when the studio row is hydrated; positional
      // fallback matches the sessions-drawer vocabulary.
      title: sessionsById[id]?.title?.trim() || `Recording ${i + 1}`,
    })),
    activeId,
    setActive: (id) => dispatch(setThreadActiveAudioSession(threadId, id)),
    createAndAttach: (title) =>
      dispatch(addAudioSessionToThread(threadId, title)),
    rename: async (id, title) => {
      try {
        const session = await dispatch(
          updateSessionThunk({ id, patch: { title: title.trim() } }),
        ).unwrap();
        if (!session) return false;
        primeEntityTitle("studio_session", id, title);
        return true;
      } catch (err) {
        console.error("[useThreadAudioSessionSelectAdapter] rename failed", {
          id,
          err,
        });
        return false;
      }
    },
    detach: (id) =>
      dispatch(removeEntityFromThread(threadId, "studio_session", id)),
  };
}
