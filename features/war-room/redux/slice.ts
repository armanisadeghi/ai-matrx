// features/war-room/redux/slice.ts
//
// RTK slice for War Room. Holds session/tile linkage + tile UI state only.
// Small, individual updates — no large-object replacements (repo doctrine).

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  containerKey,
  SINGLE_ACTIVE_ENTITY_TYPES,
  type TileTab,
  type WarRoomAssignment,
  type WarRoomSession,
  type WarRoomTile,
} from "../types";
import {
  initialWarRoomState,
  type LoadStatus,
} from "./warRoom.types";

function removeId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : ids;
}

/** Demote every same-type sibling of `keep` to is_active=false (single-active types). */
function demoteSiblings(
  list: WarRoomAssignment[],
  entityType: string,
  keepId: string,
): void {
  for (const a of list) {
    if (a.entity_type === entityType && a.id !== keepId) a.is_active = false;
  }
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
      delete state.assignmentsByContainer[containerKey("thread", id)];
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
    // ── Associations (polymorphic M2M — the one source of truth) ──────
    /** Bulk-replace assignment buckets after a room load (keyed by containerKey). */
    assignmentsLoadedBulk(
      state,
      action: PayloadAction<{ byContainer: Record<string, WarRoomAssignment[]> }>,
    ) {
      for (const [key, rows] of Object.entries(action.payload.byContainer)) {
        state.assignmentsByContainer[key] = rows;
      }
    },
    /** Replace one container's bucket (e.g. after loading a single tile's links). */
    assignmentsLoadedForContainer(
      state,
      action: PayloadAction<{ key: string; assignments: WarRoomAssignment[] }>,
    ) {
      state.assignmentsByContainer[action.payload.key] =
        action.payload.assignments;
    },
    /** Upsert one assignment; single-active types demote their same-type siblings. */
    assignmentUpserted(
      state,
      action: PayloadAction<{ key: string; assignment: WarRoomAssignment }>,
    ) {
      const { key, assignment } = action.payload;
      const list = state.assignmentsByContainer[key] ?? [];
      if (
        assignment.is_active &&
        SINGLE_ACTIVE_ENTITY_TYPES.has(
          assignment.entity_type as Parameters<
            typeof SINGLE_ACTIVE_ENTITY_TYPES.has
          >[0],
        )
      ) {
        demoteSiblings(list, assignment.entity_type, assignment.id);
      }
      const idx = list.findIndex((a) => a.id === assignment.id);
      if (idx >= 0) list[idx] = assignment;
      else list.push(assignment);
      state.assignmentsByContainer[key] = list;
    },
    /** Remove one assignment row from a container's bucket. */
    assignmentRemoved(
      state,
      action: PayloadAction<{ key: string; id: string }>,
    ) {
      const list = state.assignmentsByContainer[action.payload.key];
      if (list) {
        state.assignmentsByContainer[action.payload.key] = list.filter(
          (a) => a.id !== action.payload.id,
        );
      }
    },
    /** Mark one (entityType, entityId) active in a container, demoting siblings. */
    assignmentActiveSet(
      state,
      action: PayloadAction<{
        key: string;
        entityType: string;
        entityId: string;
      }>,
    ) {
      const { key, entityType, entityId } = action.payload;
      const list = state.assignmentsByContainer[key];
      if (!list) return;
      for (const a of list) {
        if (a.entity_type === entityType) {
          a.is_active = a.entity_id === entityId;
        }
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
        delete state.assignmentsByContainer[containerKey("thread", id)];
        delete state.autoApproveByTile[id];
      }
      delete state.assignmentsByContainer[containerKey("room", sessionId)];
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
  assignmentsLoadedBulk,
  assignmentsLoadedForContainer,
  assignmentUpserted,
  assignmentRemoved,
  assignmentActiveSet,
  setTileAutoApprove,
  clearTileAutoApprove,
  clearSessionTiles,
} = warRoomSlice.actions;

export default warRoomSlice.reducer;
