// features/war-room/redux/slice.ts
//
// RTK slice for War Room. Holds session/tile linkage + tile UI state only.
// Small, individual updates — no large-object replacements (repo doctrine).

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  TileTab,
  WarRoomSession,
  WarRoomTile,
  WarRoomTileAttachment,
} from "../types";
import {
  initialWarRoomState,
  type LoadStatus,
} from "./warRoom.types";

function removeId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : ids;
}

const warRoomSlice = createSlice({
  name: "warRoom",
  initialState: initialWarRoomState,
  reducers: {
    // ── Session list ──────────────────────────────────────────────────
    setListStatus(state, action: PayloadAction<LoadStatus>) {
      state.listStatus = action.payload;
      if (action.payload !== "error") state.listError = null;
    },
    setListError(state, action: PayloadAction<string | null>) {
      state.listError = action.payload;
      if (action.payload) state.listStatus = "error";
    },
    sessionsLoaded(state, action: PayloadAction<WarRoomSession[]>) {
      state.sessionsById = {};
      state.sessionIds = [];
      for (const s of action.payload) {
        state.sessionsById[s.id] = s;
        state.sessionIds.push(s.id);
      }
      state.listStatus = "ready";
      state.listError = null;
    },
    sessionUpserted(state, action: PayloadAction<WarRoomSession>) {
      const s = action.payload;
      const existed = !!state.sessionsById[s.id];
      state.sessionsById[s.id] = s;
      if (!existed) state.sessionIds.unshift(s.id);
    },
    sessionRemoved(state, action: PayloadAction<string>) {
      const id = action.payload;
      delete state.sessionsById[id];
      state.sessionIds = removeId(state.sessionIds, id);
      if (state.activeSessionId === id) state.activeSessionId = null;
    },
    setActiveSession(state, action: PayloadAction<string | null>) {
      state.activeSessionId = action.payload;
    },

    // ── Tiles ─────────────────────────────────────────────────────────
    setTilesStatus(
      state,
      action: PayloadAction<{ sessionId: string; status: LoadStatus }>,
    ) {
      state.tilesStatusBySession[action.payload.sessionId] =
        action.payload.status;
    },
    tilesLoadedForSession(
      state,
      action: PayloadAction<{ sessionId: string; tiles: WarRoomTile[] }>,
    ) {
      const { sessionId, tiles } = action.payload;
      const ids: string[] = [];
      for (const t of tiles) {
        state.tilesById[t.id] = t;
        ids.push(t.id);
      }
      state.tileIdsBySession[sessionId] = ids;
      state.tilesStatusBySession[sessionId] = "ready";
    },
    tileUpserted(state, action: PayloadAction<WarRoomTile>) {
      const t = action.payload;
      const existed = !!state.tilesById[t.id];
      state.tilesById[t.id] = t;
      if (!existed) {
        const ids = state.tileIdsBySession[t.session_id] ?? [];
        if (!ids.includes(t.id)) ids.push(t.id);
        state.tileIdsBySession[t.session_id] = ids;
      }
    },
    tileRemoved(
      state,
      action: PayloadAction<{ id: string; sessionId: string }>,
    ) {
      const { id, sessionId } = action.payload;
      delete state.tilesById[id];
      if (state.tileIdsBySession[sessionId]) {
        state.tileIdsBySession[sessionId] = removeId(
          state.tileIdsBySession[sessionId],
          id,
        );
      }
      delete state.audioSessionIdsByTile[id];
      delete state.activeAudioSessionByTile[id];
      delete state.noteIdsByTile[id];
      delete state.activeNoteByTile[id];
      delete state.attachmentsByTile[id];
    },
    setTileActiveTab(
      state,
      action: PayloadAction<{ id: string; tab: TileTab }>,
    ) {
      const t = state.tilesById[action.payload.id];
      if (t) t.active_tab = action.payload.tab;
    },
    setTilePinned(
      state,
      action: PayloadAction<{ id: string; pinned: boolean }>,
    ) {
      const t = state.tilesById[action.payload.id];
      if (t) t.is_pinned = action.payload.pinned;
    },
    setTileHidden(
      state,
      action: PayloadAction<{ id: string; hidden: boolean }>,
    ) {
      const t = state.tilesById[action.payload.id];
      if (t) t.is_hidden = action.payload.hidden;
    },
    setTilePosition(
      state,
      action: PayloadAction<{ id: string; position: number }>,
    ) {
      const t = state.tilesById[action.payload.id];
      if (t) t.position = action.payload.position;
    },
    setTileLink(
      state,
      action: PayloadAction<{
        id: string;
        taskId?: string | null;
        noteId?: string | null;
      }>,
    ) {
      const t = state.tilesById[action.payload.id];
      if (!t) return;
      if (action.payload.taskId !== undefined) t.task_id = action.payload.taskId;
      if (action.payload.noteId !== undefined) t.note_id = action.payload.noteId;
    },

    // ── Audio links ───────────────────────────────────────────────────
    audioSessionsLoadedForTile(
      state,
      action: PayloadAction<{
        tileId: string;
        studioSessionIds: string[];
        activeId: string | null;
      }>,
    ) {
      const { tileId, studioSessionIds, activeId } = action.payload;
      state.audioSessionIdsByTile[tileId] = studioSessionIds;
      state.activeAudioSessionByTile[tileId] = activeId;
    },
    audioSessionLinkedToTile(
      state,
      action: PayloadAction<{ tileId: string; studioSessionId: string }>,
    ) {
      const { tileId, studioSessionId } = action.payload;
      const ids = state.audioSessionIdsByTile[tileId] ?? [];
      if (!ids.includes(studioSessionId)) ids.push(studioSessionId);
      state.audioSessionIdsByTile[tileId] = ids;
      state.activeAudioSessionByTile[tileId] = studioSessionId;
    },
    setActiveAudioSession(
      state,
      action: PayloadAction<{ tileId: string; studioSessionId: string | null }>,
    ) {
      state.activeAudioSessionByTile[action.payload.tileId] =
        action.payload.studioSessionId;
    },

    // ── Note links ────────────────────────────────────────────────────
    noteSessionsLoadedForTile(
      state,
      action: PayloadAction<{
        tileId: string;
        noteIds: string[];
        activeId: string | null;
      }>,
    ) {
      const { tileId, noteIds, activeId } = action.payload;
      state.noteIdsByTile[tileId] = noteIds;
      state.activeNoteByTile[tileId] = activeId;
    },
    noteLinkedToTile(
      state,
      action: PayloadAction<{ tileId: string; noteId: string }>,
    ) {
      const { tileId, noteId } = action.payload;
      const ids = state.noteIdsByTile[tileId] ?? [];
      if (!ids.includes(noteId)) ids.push(noteId);
      state.noteIdsByTile[tileId] = ids;
      state.activeNoteByTile[tileId] = noteId;
    },
    setActiveNote(
      state,
      action: PayloadAction<{ tileId: string; noteId: string | null }>,
    ) {
      state.activeNoteByTile[action.payload.tileId] = action.payload.noteId;
    },

    // ── File / document attachments ───────────────────────────────────
    attachmentsLoadedForTile(
      state,
      action: PayloadAction<{
        tileId: string;
        attachments: WarRoomTileAttachment[];
      }>,
    ) {
      state.attachmentsByTile[action.payload.tileId] =
        action.payload.attachments;
    },
    attachmentUpserted(
      state,
      action: PayloadAction<{
        tileId: string;
        attachment: WarRoomTileAttachment;
      }>,
    ) {
      const { tileId, attachment } = action.payload;
      const list = state.attachmentsByTile[tileId] ?? [];
      const idx = list.findIndex((a) => a.id === attachment.id);
      if (idx >= 0) list[idx] = attachment;
      else list.push(attachment);
      state.attachmentsByTile[tileId] = list;
    },
    attachmentRemoved(
      state,
      action: PayloadAction<{ tileId: string; id: string }>,
    ) {
      const { tileId, id } = action.payload;
      const list = state.attachmentsByTile[tileId];
      if (list) {
        state.attachmentsByTile[tileId] = list.filter((a) => a.id !== id);
      }
    },

    // ── Agent-edit auto-approve (HITL) ────────────────────────────────
    /**
     * Grant ("always approve") a class of agent edit on a tile, so the approval
     * card stops asking. The dispatcher fires a loud, revocable toast on each
     * silently-approved write — auto-approve is never silent.
     */
    setTileAutoApprove(
      state,
      action: PayloadAction<{ tileId: string; scope: string; value: boolean }>,
    ) {
      const { tileId, scope, value } = action.payload;
      const cur = state.autoApproveByTile[tileId] ?? {};
      if (value) cur[scope] = true;
      else delete cur[scope];
      if (Object.keys(cur).length > 0) state.autoApproveByTile[tileId] = cur;
      else delete state.autoApproveByTile[tileId];
    },

    /** Revoke one scope's grant (omit `scope` to revoke every grant on the tile). */
    clearTileAutoApprove(
      state,
      action: PayloadAction<{ tileId: string; scope?: string }>,
    ) {
      const { tileId, scope } = action.payload;
      if (!scope) {
        delete state.autoApproveByTile[tileId];
        return;
      }
      const cur = state.autoApproveByTile[tileId];
      if (!cur) return;
      delete cur[scope];
      if (Object.keys(cur).length === 0) delete state.autoApproveByTile[tileId];
    },

    /** Drop all loaded tiles for a session (e.g. when leaving the room). */
    clearSessionTiles(state, action: PayloadAction<string>) {
      const sessionId = action.payload;
      const ids = state.tileIdsBySession[sessionId] ?? [];
      for (const id of ids) {
        delete state.tilesById[id];
        delete state.audioSessionIdsByTile[id];
        delete state.activeAudioSessionByTile[id];
        delete state.noteIdsByTile[id];
        delete state.activeNoteByTile[id];
        delete state.attachmentsByTile[id];
        delete state.autoApproveByTile[id];
      }
      delete state.tileIdsBySession[sessionId];
      delete state.tilesStatusBySession[sessionId];
    },
  },
});

export const {
  setListStatus,
  setListError,
  sessionsLoaded,
  sessionUpserted,
  sessionRemoved,
  setActiveSession,
  setTilesStatus,
  tilesLoadedForSession,
  tileUpserted,
  tileRemoved,
  setTileActiveTab,
  setTilePinned,
  setTileHidden,
  setTilePosition,
  setTileLink,
  audioSessionsLoadedForTile,
  audioSessionLinkedToTile,
  setActiveAudioSession,
  noteSessionsLoadedForTile,
  noteLinkedToTile,
  setActiveNote,
  attachmentsLoadedForTile,
  attachmentUpserted,
  attachmentRemoved,
  setTileAutoApprove,
  clearTileAutoApprove,
  clearSessionTiles,
} = warRoomSlice.actions;

export default warRoomSlice.reducer;
