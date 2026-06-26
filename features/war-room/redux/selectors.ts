// features/war-room/redux/selectors.ts
//
// Memoized selectors for War Room.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { makeSelectEntityScopeIds } from "@/features/scopes/redux/selectors/tree";
import type { EntityType } from "@/features/scopes/types";
import {
  containerKey,
  type ThreadAnchorType,
  type ThreadContext,
  type ThreadUserState,
  type WarRoomAssignment,
  type WarRoomContainerType,
  type WarRoomSession,
  type WarRoomThread,
} from "../types";

const EMPTY_IDS: string[] = [];
const EMPTY_SESSIONS: WarRoomSession[] = [];
const DEFAULT_USER_STATE: ThreadUserState = {
  isPinned: false,
  isHidden: false,
};

const selectEntityScopeIds = makeSelectEntityScopeIds();

// ── Roots ─────────────────────────────────────────────────────────────
export const selectSessionsById = (state: RootState) =>
  state.warRoom.sessionsById;
const selectSessionIds = (state: RootState) => state.warRoom.sessionIds;
export const selectThreadsById = (state: RootState) =>
  state.warRoom.threadsById;
const selectThreadIdsByRoom = (state: RootState) =>
  state.warRoom.threadIdsByRoom;
export const selectOrphanThreadIds = (state: RootState) =>
  state.warRoom.orphanThreadIds;
const selectThreadUserStateById = (state: RootState) =>
  state.warRoom.threadUserStateById;

export const selectListStatus = (state: RootState) => state.warRoom.listStatus;
export const selectListError = (state: RootState) => state.warRoom.listError;
export const selectActiveSessionId = (state: RootState) =>
  state.warRoom.activeSessionId;

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

// ── Threads ───────────────────────────────────────────────────────────
const threadByIdCache = new Map<
  string,
  (state: RootState) => WarRoomThread | null
>();
export function selectThreadById(id: string | null) {
  if (!id) return () => null;
  let sel = threadByIdCache.get(id);
  if (!sel) {
    sel = createSelector(selectThreadsById, (byId) => byId[id] ?? null);
    threadByIdCache.set(id, sel);
  }
  return sel;
}

export const selectThreadIdsForRoom =
  (roomId: string | null) =>
  (state: RootState): string[] =>
    roomId ? (state.warRoom.threadIdsByRoom[roomId] ?? EMPTY_IDS) : EMPTY_IDS;

export const selectThreadsStatusForRoom =
  (roomId: string | null) => (state: RootState) =>
    roomId ? (state.warRoom.threadsStatusByRoom[roomId] ?? "idle") : "idle";

function threadUserState(state: RootState, threadId: string): ThreadUserState {
  return state.warRoom.threadUserStateById[threadId] ?? DEFAULT_USER_STATE;
}

const orderedGalleryCache = new Map<string, (state: RootState) => string[]>();
export function selectOrderedGalleryThreadIds(roomId: string | null) {
  if (!roomId) return () => EMPTY_IDS;
  let sel = orderedGalleryCache.get(roomId);
  if (!sel) {
    sel = createSelector(
      [selectThreadsById, selectThreadIdsByRoom, selectThreadUserStateById],
      (byId, idsByRoom, userStateById): string[] => {
        const ids = idsByRoom[roomId] ?? EMPTY_IDS;
        const visible = ids
          .map((id) => ({ thread: byId[id], id, us: userStateById[id] }))
          .filter(
            (
              row,
            ): row is {
              thread: WarRoomThread;
              id: string;
              us: ThreadUserState | undefined;
            } => !!row.thread && !(row.us?.isHidden ?? false),
          );
        visible.sort((a, b) => {
          const ap = a.us?.isPinned ?? false;
          const bp = b.us?.isPinned ?? false;
          if (ap !== bp) return ap ? -1 : 1;
          return a.thread.position - b.thread.position;
        });
        return visible.map((row) => row.id);
      },
    );
    orderedGalleryCache.set(roomId, sel);
  }
  return sel;
}

const hiddenThreadsCache = new Map<
  string,
  (state: RootState) => WarRoomThread[]
>();
export function selectHiddenThreads(roomId: string | null) {
  if (!roomId) return () => [] as WarRoomThread[];
  let sel = hiddenThreadsCache.get(roomId);
  if (!sel) {
    sel = createSelector(
      [selectThreadsById, selectThreadIdsByRoom, selectThreadUserStateById],
      (byId, idsByRoom, userStateById): WarRoomThread[] => {
        const ids = idsByRoom[roomId] ?? EMPTY_IDS;
        return ids
          .map((id) => byId[id])
          .filter(
            (t): t is WarRoomThread =>
              !!t && (userStateById[t.id]?.isHidden ?? false),
          );
      },
    );
    hiddenThreadsCache.set(roomId, sel);
  }
  return sel;
}

export const selectThreadIsPinned =
  (threadId: string | null) =>
  (state: RootState): boolean =>
    threadId
      ? (state.warRoom.threadUserStateById[threadId]?.isPinned ?? false)
      : false;

export const selectPinnedThreadCount =
  (roomId: string | null) =>
  (state: RootState): number => {
    if (!roomId) return 0;
    const ids = state.warRoom.threadIdsByRoom[roomId] ?? EMPTY_IDS;
    let n = 0;
    for (const id of ids) {
      const us = threadUserState(state, id);
      const t = state.warRoom.threadsById[id];
      if (t && !us.isHidden && us.isPinned) n++;
    }
    return n;
  };

const threadContextCache = new Map<
  string,
  (state: RootState) => ThreadContext
>();
export function selectThreadEffectiveContext(
  threadId: string | null,
  roomId: string | null = null,
) {
  if (!threadId) {
    return (): ThreadContext => ({
      organizationId: null,
      scopeIds: EMPTY_IDS,
      isOverridden: false,
    });
  }
  const cacheKey = `${threadId}:${roomId ?? ""}`;
  let sel = threadContextCache.get(cacheKey);
  if (!sel) {
    sel = createSelector(
      [selectThreadsById, selectSessionsById],
      (threadsById, sessionsById): ThreadContext => {
        const thread = threadsById[threadId];
        const room = roomId ? sessionsById[roomId] : null;
        return {
          organizationId:
            thread?.organization_id ?? room?.organization_id ?? null,
          scopeIds: EMPTY_IDS,
          isOverridden: false,
        };
      },
    );
    threadContextCache.set(cacheKey, sel);
  }
  return sel;
}

// ── Associations ────────────────────────────────────────────────────────
const EMPTY_ASSIGNMENTS: WarRoomAssignment[] = [];
const selectAssignmentsByContainer = (state: RootState) =>
  state.warRoom.assignmentsByContainer;

const assignmentsContainerCache = new Map<
  string,
  (state: RootState) => WarRoomAssignment[]
>();
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

function bucket(
  state: RootState,
  type: WarRoomContainerType,
  id: string,
): WarRoomAssignment[] {
  return (
    state.warRoom.assignmentsByContainer[containerKey(type, id)] ??
    EMPTY_ASSIGNMENTS
  );
}

const entityIdsCache = new Map<string, (state: RootState) => string[]>();
function selectThreadEntityIds(threadId: string, entityType: string) {
  const cacheKey = `${threadId}:${entityType}`;
  let sel = entityIdsCache.get(cacheKey);
  if (!sel) {
    sel = createSelector(
      selectAssignmentsForContainer("thread", threadId),
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

function activeEntityId(
  rows: WarRoomAssignment[],
  entityType: string,
): string | null {
  const active = rows.find((r) => r.entity_type === entityType && r.is_active);
  if (active) return active.entity_id;
  const first = rows.find((r) => r.entity_type === entityType);
  return first?.entity_id ?? null;
}

// ── Anchor + project ────────────────────────────────────────────────────

export const selectThreadAnchorType =
  (threadId: string | null) =>
  (state: RootState): ThreadAnchorType => {
    const t = threadId ? state.warRoom.threadsById[threadId] : null;
    const a = t?.anchor_type;
    if (a === "task" || a === "project") return a;
    return "canvas";
  };

/** UI picker value — maps anchor `canvas` → picker `canvas`. */
export const selectThreadPickerOption =
  (threadId: string | null) =>
  (state: RootState): import("../types").ThreadPickerOption => {
    const anchor = selectThreadAnchorType(threadId)(state);
    if (anchor === "canvas") return "canvas";
    return anchor;
  };

export const selectThreadTaskId =
  (threadId: string | null) =>
  (state: RootState): string | null => {
    if (!threadId) return null;
    const t = state.warRoom.threadsById[threadId];
    if (t?.anchor_type === "canvas") return null;
    if (t?.anchor_type === "task" && t.anchor_id) return t.anchor_id;
    return activeEntityId(bucket(state, "thread", threadId), "task");
  };

function isCanvasResourceRow(row: WarRoomAssignment): boolean {
  const md = row.metadata;
  if (typeof md !== "object" || md === null || Array.isArray(md)) return false;
  return (md as Record<string, unknown>).canvas === true;
}

const canvasResourcesCache = new Map<
  string,
  (state: RootState) => WarRoomAssignment[]
>();
/** Canvas-tab shortcuts — edges tagged with metadata `{ canvas: true }`. */
export function selectCanvasResourcesForThread(threadId: string | null) {
  if (!threadId) return () => EMPTY_ASSIGNMENTS;
  let sel = canvasResourcesCache.get(threadId);
  if (!sel) {
    sel = createSelector(
      selectAssignmentsForContainer("thread", threadId),
      (rows): WarRoomAssignment[] => {
        const resources = rows.filter(isCanvasResourceRow);
        return resources.length > 0 ? resources : EMPTY_ASSIGNMENTS;
      },
    );
    canvasResourcesCache.set(threadId, sel);
  }
  return sel;
}

export const selectThreadProjectId =
  (threadId: string | null) =>
  (state: RootState): string | null => {
    if (!threadId) return null;
    const t = state.warRoom.threadsById[threadId];
    if (t?.anchor_type === "project" && t.anchor_id) return t.anchor_id;
    return null;
  };

export const selectRoomProjectId =
  (roomId: string | null) =>
  (state: RootState): string | null =>
    roomId ? activeEntityId(bucket(state, "room", roomId), "project") : null;

/** @deprecated */
export const selectSessionProjectId = selectRoomProjectId;

export const selectEffectiveThreadProjectId =
  (threadId: string | null, roomId: string | null = null) =>
  (state: RootState): string | null => {
    if (!threadId) return null;
    const threadProject = selectThreadProjectId(threadId)(state);
    if (threadProject) return threadProject;
    if (roomId) return selectRoomProjectId(roomId)(state);
    return null;
  };

export const selectRoomProjectMode =
  (roomId: string | null) =>
  (state: RootState): "room" | "per-thread" | "none" => {
    if (!roomId) return "none";
    if (selectRoomProjectId(roomId)(state)) return "room";

    const ids = state.warRoom.threadIdsByRoom[roomId] ?? EMPTY_IDS;
    for (const id of ids) {
      if (selectThreadProjectId(id)(state)) return "per-thread";
    }
    return "none";
  };

/** @deprecated */
export const selectSessionProjectMode = selectRoomProjectMode;

// ── Tab content entity ids ──────────────────────────────────────────────
export const selectAudioSessionIdsForThread = (threadId: string | null) =>
  threadId
    ? selectThreadEntityIds(threadId, "studio_session")
    : () => EMPTY_IDS;

export const selectActiveAudioSessionId =
  (threadId: string | null) =>
  (state: RootState): string | null =>
    threadId
      ? activeEntityId(bucket(state, "thread", threadId), "studio_session")
      : null;

export const selectNoteIdsForThread = (threadId: string | null) =>
  threadId ? selectThreadEntityIds(threadId, "note") : () => EMPTY_IDS;

export const selectActiveNoteId =
  (threadId: string | null) =>
  (state: RootState): string | null =>
    threadId ? activeEntityId(bucket(state, "thread", threadId), "note") : null;

const attachmentsCache = new Map<
  string,
  (state: RootState) => WarRoomAssignment[]
>();
export function selectAttachmentsForThread(threadId: string | null) {
  if (!threadId) return () => EMPTY_ASSIGNMENTS;
  let sel = attachmentsCache.get(threadId);
  if (!sel) {
    sel = createSelector(
      selectAssignmentsForContainer("thread", threadId),
      (rows): WarRoomAssignment[] => {
        const atts = rows.filter(
          (r) => r.entity_type === "user_file" || r.entity_type === "document",
        );
        return atts.length > 0 ? atts : EMPTY_ASSIGNMENTS;
      },
    );
    attachmentsCache.set(threadId, sel);
  }
  return sel;
}

// ── Auto-approve ────────────────────────────────────────────────────────
export const selectIsThreadAutoApproved =
  (threadId: string | null, scope: string) =>
  (state: RootState): boolean =>
    threadId
      ? state.warRoom.autoApproveByThread[threadId]?.[scope] === true
      : false;

const EMPTY_SCOPES: string[] = [];
const autoApprovedScopesCache = new Map<
  string,
  (state: RootState) => string[]
>();
export function selectThreadAutoApprovedScopes(threadId: string | null) {
  if (!threadId) return () => EMPTY_SCOPES;
  let sel = autoApprovedScopesCache.get(threadId);
  if (!sel) {
    sel = createSelector(
      (state: RootState) => state.warRoom.autoApproveByThread[threadId],
      (grants): string[] => {
        if (!grants) return EMPTY_SCOPES;
        const keys = Object.keys(grants).filter((k) => grants[k]);
        return keys.length > 0 ? keys : EMPTY_SCOPES;
      },
    );
    autoApprovedScopesCache.set(threadId, sel);
  }
  return sel;
}

export function selectScopeIdsForEntity(
  entityType: EntityType,
  entityId: string | null,
) {
  if (!entityId) return () => EMPTY_IDS;
  return (state: RootState) =>
    selectEntityScopeIds(state, { entityType, entityId });
}

/** Empty scope array helper for legacy callers. */
export function asScopeIds(_value: unknown): string[] {
  return EMPTY_IDS;
}
