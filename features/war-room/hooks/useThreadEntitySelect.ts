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
//   useThreadAudioSessionSelectAdapter  — the Audio tab's studio sessions
//   useThreadConversationSelectAdapter  — the Chat (agent) tab's conversations

"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { AssociationEntitySelectAdapter } from "@/features/scopes/components/associations/AssociationEntitySelect";
import {
  getCachedEntityTitle,
  primeEntityTitle,
} from "@/features/scopes/service/entityTitles";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { selectNotesMap } from "@/features/notes/redux/selectors";
import { update as updateNoteApi } from "@/features/notes/service/notesApi";
import { upsertNoteFromServer } from "@/features/notes/redux/slice";
import {
  selectAssistantConversationId,
  selectAssistantConversations,
  selectSessionsById,
} from "@/features/transcript-studio/redux/selectors";
import { updateSessionThunk } from "@/features/transcript-studio/redux/thunks";
import { selectAllAgents } from "@/features/agents/redux/agent-definition/selectors";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import {
  selectActiveAudioSessionId,
  selectActiveConversationId,
  selectActiveNoteId,
  selectAudioSessionIdsForThread,
  selectContainerAssignmentsLoaded,
  selectConversationIdsForThread,
  selectNoteIdsForThread,
} from "@/features/war-room/redux/selectors";
import {
  addAudioSessionToThread,
  addNoteToThread,
  removeEntityFromThread,
  setThreadActiveAudioSession,
  setThreadActiveConversation,
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

/**
 * The Chat tab's conversations — `conversation → thread` edges. The ACTIVE
 * chat is what the session's assistant pointer binds the embedded panel to
 * (edge is_active mirrors it). Labels resolve: live conversation-list title
 * (updates seconds after the first turn, on the server's `conversation_labeled`
 * event) → fetched cx_conversation title (reloads) → the chat's AGENT name
 * (a fresh chat has no row/label yet) → positional "Chat N".
 *
 * No `createAndAttach`: a chat is created by PICKING AN AGENT — the Chat tab
 * passes the canonical AgentListDropdown via the component's `createSlot` and
 * dispatches `startThreadConversation`.
 */
export function useThreadConversationSelectAdapter(
  threadId: string,
  sessionId: string | null,
): AssociationEntitySelectAdapter {
  const dispatch = useAppDispatch();
  const loaded = useAppSelector(
    selectContainerAssignmentsLoaded("thread", threadId),
  );
  const edgeIds = useAppSelector(selectConversationIdsForThread(threadId));
  const edgeActiveId = useAppSelector(selectActiveConversationId(threadId));
  // What the panel is actually bound to right now — wins over the edge flag.
  const boundId = useAppSelector(selectAssistantConversationId(sessionId));
  const listById = useAppSelector((s) => s.conversationList.byConversationId);
  const roster = useAppSelector(selectAssistantConversations(sessionId));
  const agentsById = useAppSelector(selectAllAgents);

  // A just-minted chat's edge write is in flight for a moment — surface the
  // bound conversation immediately so the label never blanks.
  const ids =
    boundId && !edgeIds.includes(boundId) ? [...edgeIds, boundId] : edgeIds;

  // Kick the batched DB-title fetch for edges whose list entry isn't loaded
  // (e.g. after a reload, before any conversation list hydrates).
  useEntityTitles(
    ids.map((id) => ({
      token: "conversation",
      id,
      label: listById[id]?.title ?? null,
    })),
  );

  const items = ids.map((id, i) => {
    const agentId = roster.find((r) => r.conversationId === id)?.agentId;
    const agentName = agentId ? agentsById[agentId]?.name : undefined;
    return {
      id,
      title:
        listById[id]?.title?.trim() ||
        getCachedEntityTitle("conversation", id) ||
        agentName?.trim() ||
        `Chat ${i + 1}`,
    };
  });

  return {
    loading: !loaded,
    items,
    activeId: boundId ?? edgeActiveId,
    setActive: (id) => {
      if (!sessionId) return;
      return dispatch(setThreadActiveConversation(threadId, sessionId, id));
    },
    rename: async (id, title) => {
      try {
        await dispatch(renameConversation({ conversationId: id, title })).unwrap();
        primeEntityTitle("conversation", id, title);
        return true;
      } catch (err) {
        console.error("[useThreadConversationSelectAdapter] rename failed", {
          id,
          err,
        });
        return false;
      }
    },
    detach: (id) => dispatch(removeEntityFromThread(threadId, "conversation", id)),
  };
}
