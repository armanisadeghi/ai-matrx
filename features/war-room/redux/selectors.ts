// features/war-room/redux/selectors.ts
//
// Memoized selectors for War Room. Per-id/per-session selectors are cached per
// key so each key gets ONE stable createSelector instance (avoids React 19
// subscription tearing that a fresh instance per call would cause).

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import type {
  TileContext,
  WarRoomSession,
  WarRoomTile,
  WarRoomTileAttachment,
} from "../types";

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

// ── Flavor + project association ───────────────────────────────────────
// All return stable primitives (string | null), so no memoization needed.

/** A tile's flavor: 'thread' (default) | 'task' | 'project'. */
export const selectTileFlavor =
  (tileId: string | null) =>
  (state: RootState): "thread" | "task" | "project" => {
    const t = tileId ? state.warRoom.tilesById[tileId] : null;
    const f = t?.flavor;
    return f === "task" || f === "project" ? f : "thread";
  };

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
 * (The invariant guarantees these never CONFLICT — a tile's own id, when set,
 * is the room's id unless the room has none.)
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
 * Drives the room header label + the conflict prompt copy.
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

// ── Audio links ───────────────────────────────────────────────────────
export const selectAudioSessionIdsForTile =
  (tileId: string | null) =>
  (state: RootState): string[] =>
    tileId ? (state.warRoom.audioSessionIdsByTile[tileId] ?? EMPTY_IDS) : EMPTY_IDS;

export const selectActiveAudioSessionId =
  (tileId: string | null) =>
  (state: RootState): string | null =>
    tileId ? (state.warRoom.activeAudioSessionByTile[tileId] ?? null) : null;

// ── Note links ──────────────────────────────────────────────────────────
export const selectNoteIdsForTile =
  (tileId: string | null) =>
  (state: RootState): string[] =>
    tileId ? (state.warRoom.noteIdsByTile[tileId] ?? EMPTY_IDS) : EMPTY_IDS;

export const selectActiveNoteId =
  (tileId: string | null) =>
  (state: RootState): string | null =>
    tileId ? (state.warRoom.activeNoteByTile[tileId] ?? null) : null;

// ── File / document attachments ──────────────────────────────────────────
export const selectAttachmentsForTile =
  (tileId: string | null) =>
  (state: RootState): WarRoomTileAttachment[] =>
    tileId
      ? (state.warRoom.attachmentsByTile[tileId] ?? EMPTY_ATTACHMENTS)
      : EMPTY_ATTACHMENTS;

const EMPTY_ATTACHMENTS: WarRoomTileAttachment[] = [];

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
