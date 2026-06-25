// features/war-room/redux/selectors.ts
//
// Memoized selectors for War Room. Per-id/per-session selectors are cached per
// key so each key gets ONE stable createSelector instance (avoids React 19
// subscription tearing that a fresh instance per call would cause).

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import {
  containerKey,
  type TileContext,
  type WarRoomAssignment,
  type WarRoomContainerType,
  type WarRoomSession,
  type WarRoomTile,
} from "../types";
import { UNASSIGNED_ROOM_TITLE } from "../constants";

/** Coerce a jsonb context_scope_ids value to a string[]. */
function asScopeIds(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? (value.filter((v) => typeof v === "string") as string[]) : [];
}

const EMPTY_IDS: string[] = [];
const EMPTY_SESSIONS: WarRoomSession[] = [];

// ── Roots ─────────────────────────────────────────────────────────────
export const selectSessionsById = (state: RootState) => state.warRoom.sessionsById;
const selectSessionIds = (state: RootState) => state.warRoom.sessionIds;
const selectTilesById = (state: RootState) => state.warRoom.tilesById;
const selectTileIdsBySession = (state: RootState) =>
  state.warRoom.tileIdsBySession;

export const selectListStatus = (state: RootState) => state.warRoom.listStatus;
export const selectListError = (state: RootState) => state.warRoom.listError;
export const selectActiveSessionId = (state: RootState) =>
  state.warRoom.activeSessionId;

// ── Session list ──────────────────────────────────────────────────────
export const selectSessionsList = createSelector(
  [selectSessionsById, selectSessionIds],
  (byId, ids): WarRoomSession[] => {
    if (ids.length === 0) return EMPTY_SESSIONS;
    return ids.map((id) => byId[id]).filter(Boolean) as WarRoomSession[];
  },
);

// ── Unassigned holding room (the holding area) ──────────────────────────
/** The user's "Unassigned threads" holding room id (where removed threads land), or null. */
export const selectUnassignedSessionId = createSelector(
  [selectSessionsById, selectSessionIds],
  (byId, ids): string | null =>
    ids.find((id) => byId[id]?.title === UNASSIGNED_ROOM_TITLE) ?? null,
);

/** Whether a session IS the holding room — for distinct treatment + move-target guards. */
export const selectIsUnassignedSession =
  (sessionId: string | null) =>
  (state: RootState): boolean =>
    !!sessionId &&
    state.warRoom.sessionsById[sessionId]?.title === UNASSIGNED_ROOM_TITLE;

const sessionByIdCache = new Map<
  string,
  (state: RootState) => WarRoomSession | null
>();
export function selectSessionById(id: string | null) {
  if (!id) return () => null;
  let sel = sessionByIdCache.get(id);
  if (!sel) {
    sel = createSelector(selectSessionsById, (byId) => byId[id] ?? null);
    sessionByIdCache.set(id, sel);
  }
  return sel;
}

// ── Tiles ─────────────────────────────────────────────────────────────
const tileByIdCache = new Map<string, (state: RootState) => WarRoomTile | null>();
export function selectTileById(id: string | null) {
  if (!id) return () => null;
  let sel = tileByIdCache.get(id);
  if (!sel) {
    sel = createSelector(selectTilesById, (byId) => byId[id] ?? null);
    tileByIdCache.set(id, sel);
  }
  return sel;
}

export const selectTileIdsForSession =
  (sessionId: string | null) =>
  (state: RootState): string[] =>
    sessionId ? (state.warRoom.tileIdsBySession[sessionId] ?? EMPTY_IDS) : EMPTY_IDS;

export const selectTilesStatusForSession =
  (sessionId: string | null) =>
  (state: RootState) =>
    sessionId
      ? (state.warRoom.tilesStatusBySession[sessionId] ?? "idle")
      : "idle";

/**
 * Ordered, VISIBLE tile ids for the gallery: pinned first, then by position.
 * One stable createSelector instance per sessionId.
 */
const orderedGalleryCache = new Map<string, (state: RootState) => string[]>();
export function selectOrderedGalleryTileIds(sessionId: string | null) {
  if (!sessionId) return () => EMPTY_IDS;
  let sel = orderedGalleryCache.get(sessionId);
  if (!sel) {
    sel = createSelector(
      [selectTilesById, selectTileIdsBySession],
      (byId, idsBySession): string[] => {
        const ids = idsBySession[sessionId] ?? EMPTY_IDS;
        const visible = ids
          .map((id) => byId[id])
          .filter((t): t is WarRoomTile => !!t && !t.is_hidden);
        visible.sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return a.position - b.position;
        });
        return visible.map((t) => t.id);
      },
    );
    orderedGalleryCache.set(sessionId, sel);
  }
  return sel;
}

const hiddenTilesCache = new Map<string, (state: RootState) => WarRoomTile[]>();
export function selectHiddenTiles(sessionId: string | null) {
  if (!sessionId) return () => [] as WarRoomTile[];
  let sel = hiddenTilesCache.get(sessionId);
  if (!sel) {
    sel = createSelector(
      [selectTilesById, selectTileIdsBySession],
      (byId, idsBySession): WarRoomTile[] => {
        const ids = idsBySession[sessionId] ?? EMPTY_IDS;
        return ids
          .map((id) => byId[id])
          .filter((t): t is WarRoomTile => !!t && t.is_hidden);
      },
    );
    hiddenTilesCache.set(sessionId, sel);
  }
  return sel;
}

export const selectPinnedTileCount =
  (sessionId: string | null) =>
  (state: RootState): number => {
    if (!sessionId) return 0;
    const ids = state.warRoom.tileIdsBySession[sessionId] ?? EMPTY_IDS;
    let n = 0;
    for (const id of ids) {
      const t = state.warRoom.tilesById[id];
      if (t && !t.is_hidden && t.is_pinned) n++;
    }
    return n;
  };

/**
 * Effective context for a tile: per-tile override falls back to the session
 * default. context_scope_ids === null means "inherit". A controlled selection
 * carried by the records — never appContextSlice.
 */
const tileContextCache = new Map<string, (state: RootState) => TileContext>();
export function selectTileEffectiveContext(tileId: string | null) {
  if (!tileId) {
    return (): TileContext => ({
      organizationId: null,
      scopeIds: EMPTY_IDS,
      isOverridden: false,
    });
  }
  let sel = tileContextCache.get(tileId);
  if (!sel) {
    sel = createSelector(
      [selectTilesById, selectSessionsById],
      (tilesById, sessionsById): TileContext => {
        const tile = tilesById[tileId];
        const session = tile ? sessionsById[tile.session_id] : null;
        const hasOrgOverride = !!tile?.context_organization_id;
        const hasScopeOverride =
          tile?.context_scope_ids !== null &&
          tile?.context_scope_ids !== undefined;
        return {
          organizationId:
            tile?.context_organization_id ?? session?.organization_id ?? null,
          scopeIds: hasScopeOverride
            ? asScopeIds(tile?.context_scope_ids)
            : asScopeIds(session?.context_scope_ids),
          isOverridden: hasOrgOverride || hasScopeOverride,
        };
      },
    );
    tileContextCache.set(tileId, sel);
  }
  return sel;
}

// ── Associations (the one polymorphic M2M source of truth) ─────────────
// Every per-type selector below DERIVES from assignmentsByContainer. Array
// returns are memoized per key (stable reference for React 19); primitive
// returns (a single id / mode) read directly — they're already stable.

const EMPTY_ASSIGNMENTS: WarRoomAssignment[] = [];
const selectAssignmentsByContainer = (state: RootState) =>
  state.warRoom.assignmentsByContainer;

const assignmentsContainerCache = new Map<
  string,
  (state: RootState) => WarRoomAssignment[]
>();
/** All assignment rows for one container (room or thread). Memoized per key. */
export function selectAssignmentsForContainer(
  type: WarRoomContainerType,
  id: string | null,
) {
  if (!id) return () => EMPTY_ASSIGNMENTS;
  const key = containerKey(type, id);
  let sel = assignmentsContainerCache.get(key);
  if (!sel) {
    sel = createSelector(
      selectAssignmentsByContainer,
      (byKey) => byKey[key] ?? EMPTY_ASSIGNMENTS,
    );
    assignmentsContainerCache.set(key, sel);
  }
  return sel;
}

/** Direct (non-memoized) read of a thread/room bucket — for primitive derivations. */
function bucket(
  state: RootState,
  type: WarRoomContainerType,
  id: string,
): WarRoomAssignment[] {
  return state.warRoom.assignmentsByContainer[containerKey(type, id)] ?? EMPTY_ASSIGNMENTS;
}

/** entity_ids of one type in a thread, ordered by position. Memoized per (tile,type). */
const entityIdsCache = new Map<string, (state: RootState) => string[]>();
function selectThreadEntityIds(tileId: string, entityType: string) {
  const cacheKey = `${tileId}:${entityType}`;
  let sel = entityIdsCache.get(cacheKey);
  if (!sel) {
    sel = createSelector(
      selectAssignmentsForContainer("thread", tileId),
      (rows): string[] => {
        const ids = rows
          .filter((r) => r.entity_type === entityType)
          .map((r) => r.entity_id);
        return ids.length > 0 ? ids : EMPTY_IDS;
      },
    );
    entityIdsCache.set(cacheKey, sel);
  }
  return sel;
}

/** The active (focused) entity_id of one type in a container, or null. */
function activeEntityId(
  rows: WarRoomAssignment[],
  entityType: string,
): string | null {
  const active = rows.find((r) => r.entity_type === entityType && r.is_active);
  if (active) return active.entity_id;
  const first = rows.find((r) => r.entity_type === entityType);
  return first?.entity_id ?? null;
}

// ── Flavor + project association ───────────────────────────────────────

/** A tile's flavor: 'thread' (default) | 'task' | 'project'. */
export const selectTileFlavor =
  (tileId: string | null) =>
  (state: RootState): "thread" | "task" | "project" => {
    const t = tileId ? state.warRoom.tilesById[tileId] : null;
    const f = t?.flavor;
    return f === "task" || f === "project" ? f : "thread";
  };

/** A tile's active task assignment (NULL when none). */
export const selectTileTaskId =
  (tileId: string | null) =>
  (state: RootState): string | null =>
    tileId ? activeEntityId(bucket(state, "thread", tileId), "task") : null;

// Project stays a real column on the tile/session (it feeds RLS via
// check_resource_access(..., s.project_id, ...) and the room/tile invariant +
// conflict logic). The backfilled 'project' assignment rows are kept for the
// imminent platform-wide relationship refactor but are NOT the read source yet.

/** A tile's own project_id (NULL when it inherits / has none). */
export const selectTileProjectId =
  (tileId: string | null) =>
  (state: RootState): string | null =>
    (tileId ? state.warRoom.tilesById[tileId]?.project_id : null) ?? null;

/** The room's project_id (NULL = the room is not associated with a project). */
export const selectSessionProjectId =
  (sessionId: string | null) =>
  (state: RootState): string | null =>
    (sessionId ? state.warRoom.sessionsById[sessionId]?.project_id : null) ??
    null;

/**
 * The project a tile effectively belongs to: its own project_id, else the
 * room's. This is the project a task created in the tile auto-associates to.
 */
export const selectEffectiveTileProjectId =
  (tileId: string | null) =>
  (state: RootState): string | null => {
    if (!tileId) return null;
    const tile = state.warRoom.tilesById[tileId];
    if (!tile) return null;
    return (
      tile.project_id ??
      state.warRoom.sessionsById[tile.session_id]?.project_id ??
      null
    );
  };

/**
 * How a room relates to projects:
 *   • 'room'       — the room itself is one project (session.project_id set)
 *   • 'per-thread' — no room project, but ≥1 tile carries its own project
 *   • 'none'       — no project anywhere
 */
export const selectSessionProjectMode =
  (sessionId: string | null) =>
  (state: RootState): "room" | "per-thread" | "none" => {
    if (!sessionId) return "none";
    if (state.warRoom.sessionsById[sessionId]?.project_id) return "room";
    const ids = state.warRoom.tileIdsBySession[sessionId] ?? EMPTY_IDS;
    for (const id of ids) {
      if (state.warRoom.tilesById[id]?.project_id) return "per-thread";
    }
    return "none";
  };

// ── Audio sessions (studio_session assignments) ────────────────────────
export const selectAudioSessionIdsForTile = (tileId: string | null) =>
  tileId ? selectThreadEntityIds(tileId, "studio_session") : () => EMPTY_IDS;

export const selectActiveAudioSessionId =
  (tileId: string | null) =>
  (state: RootState): string | null =>
    tileId ? activeEntityId(bucket(state, "thread", tileId), "studio_session") : null;

// ── Notes (note assignments) ───────────────────────────────────────────
export const selectNoteIdsForTile = (tileId: string | null) =>
  tileId ? selectThreadEntityIds(tileId, "note") : () => EMPTY_IDS;

export const selectActiveNoteId =
  (tileId: string | null) =>
  (state: RootState): string | null =>
    tileId ? activeEntityId(bucket(state, "thread", tileId), "note") : null;

// ── File / document attachments (user_file + document assignments) ──────
const attachmentsCache = new Map<
  string,
  (state: RootState) => WarRoomAssignment[]
>();
/** A tile's file + document attachments (as assignment rows), ordered by position. */
export function selectAttachmentsForTile(tileId: string | null) {
  if (!tileId) return () => EMPTY_ASSIGNMENTS;
  let sel = attachmentsCache.get(tileId);
  if (!sel) {
    sel = createSelector(
      selectAssignmentsForContainer("thread", tileId),
      (rows): WarRoomAssignment[] => {
        const atts = rows.filter(
          (r) => r.entity_type === "user_file" || r.entity_type === "document",
        );
        return atts.length > 0 ? atts : EMPTY_ASSIGNMENTS;
      },
    );
    attachmentsCache.set(tileId, sel);
  }
  return sel;
}

// ── Agent-edit auto-approve (HITL) ───────────────────────────────────────
/**
 * Whether the user has granted "always approve" for `scope` on this tile, so the
 * war-room dispatcher should skip the approval card. Returns a primitive — no
 * memoization needed.
 */
export const selectIsTileAutoApproved =
  (tileId: string | null, scope: string) =>
  (state: RootState): boolean =>
    tileId ? state.warRoom.autoApproveByTile[tileId]?.[scope] === true : false;

const EMPTY_SCOPES: string[] = [];
const autoApprovedScopesCache = new Map<
  string,
  (state: RootState) => string[]
>();
/** The list of scopes currently auto-approved on a tile (for UI indicators). */
export function selectTileAutoApprovedScopes(tileId: string | null) {
  if (!tileId) return () => EMPTY_SCOPES;
  let sel = autoApprovedScopesCache.get(tileId);
  if (!sel) {
    sel = createSelector(
      (state: RootState) => state.warRoom.autoApproveByTile[tileId],
      (grants): string[] => {
        if (!grants) return EMPTY_SCOPES;
        const keys = Object.keys(grants).filter((k) => grants[k]);
        return keys.length > 0 ? keys : EMPTY_SCOPES;
      },
    );
    autoApprovedScopesCache.set(tileId, sel);
  }
  return sel;
}

export { asScopeIds };
