// features/war-room/redux/thunks.ts
//
// Async thunks bridging the warRoom slice and Supabase via service.ts.
// Optimistic where it helps; loud (toast) on failure.

import { toast } from "sonner";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  create as createNote,
  update as updateNoteApi,
} from "@/features/notes/service/notesApi";
import { upsertNoteFromServer } from "@/features/notes/redux/slice";
import { createTaskThunk } from "@/features/tasks/redux/thunks";
import {
  upsertTaskWithLevel,
  selectTaskById,
} from "@/features/agent-context/redux/tasksSlice";
import type { TaskRecord } from "@/features/agent-context/redux/tasksSlice";
import * as taskService from "@/features/tasks/services/taskService";
import { requireUserId } from "@/utils/auth/getUserId";
import {
  createSessionThunk,
  fetchRawSegmentsThunk,
} from "@/features/transcript-studio/redux/thunks";
import { WAR_ROOM_AUDIO_SOURCE } from "../constants";
import { reportWarRoomError } from "../utils/reportWarRoomError";
import {
  selectActiveAudioSessionId,
  selectActiveNoteId,
  selectEffectiveTileProjectId,
  selectNoteIdsForTile,
  selectTileEffectiveContext,
  selectTileTaskId,
} from "./selectors";
import * as service from "../service";
import * as assoc from "../service/associations";
import {
  containerKey,
  roomRef,
  threadRef,
  type ContainerRef,
  type CreateSessionInput,
  type CreateTileInput,
  type TileFlavor,
  type TileTab,
  type WarRoomAssignment,
  type WarRoomAssignmentEntityType,
  type WarRoomSession,
  type WarRoomSessionUpdate,
  type WarRoomTile,
  type WarRoomTileUpdate,
} from "../types";
import {
  assignmentActiveSet,
  assignmentRemoved,
  assignmentsLoadedBulk,
  assignmentsLoadedForContainer,
  assignmentUpserted,
  clearSessionTiles,
  sessionRemoved,
  sessionsLoaded,
  sessionUpserted,
  setActiveSession,
  setListError,
  setListStatus,
  setTileActiveTab,
  setTileHidden,
  setTilePinned,
  setTilesStatus,
  tileRemoved,
  tileSessionChanged,
  tilesLoadedForSession,
  tileUpserted,
} from "./slice";

// ── Sessions ──────────────────────────────────────────────────────────

export const loadSessionsList = () => async (dispatch: AppDispatch) => {
  dispatch(setListStatus("loading"));
  try {
    const [sessions, allTiles] = await Promise.all([
      service.listSessions(),
      service.listAllUserTiles(),
    ]);
    dispatch(sessionsLoaded(sessions));

    // Seed the cross-room search index — group tiles by session without
    // clobbering tiles already loaded for the active room (full assignment
    // buckets arrive later via loadWarRoomSession).
    const bySession = new Map<string, WarRoomTile[]>();
    for (const t of allTiles) {
      const list = bySession.get(t.session_id) ?? [];
      list.push(t);
      bySession.set(t.session_id, list);
    }
    for (const [sessionId, tiles] of bySession) {
      dispatch(tilesLoadedForSession({ sessionId, tiles }));
    }

    // Task assignments seed thread-title fallback for cross-room search (tile.title
    // is often blank until the user renames; the anchored task title is the label).
    if (allTiles.length > 0) {
      try {
        const assignments = await assoc.listAssignmentsForContainers(
          allTiles.map((t) => threadRef(t.id)),
        );
        const byContainer: Record<string, WarRoomAssignment[]> = {};
        for (const t of allTiles) {
          byContainer[containerKey("thread", t.id)] = [];
        }
        for (const a of assignments) {
          const key = containerKey(
            a.container_type as ContainerRef["type"],
            a.container_id,
          );
          (byContainer[key] ??= []).push(a);
        }
        dispatch(assignmentsLoadedBulk({ byContainer }));

        const taskIds = assignments
          .filter((a) => a.entity_type === "task")
          .map((a) => a.entity_id);
        if (taskIds.length > 0) {
          void dispatch(hydrateTileTasks(taskIds));
        }
      } catch (err) {
        reportWarRoomError("loadSessionsList.assignments", err);
      }
    }

    return sessions;
  } catch (err) {
    dispatch(
      setListError(err instanceof Error ? err.message : "Failed to load"),
    );
    toast.error("Couldn't load your War Rooms");
    return [];
  }
};

export const createWarRoomSession =
  (input: CreateSessionInput = {}) =>
  async (dispatch: AppDispatch): Promise<WarRoomSession | null> => {
    try {
      const session = await service.createSession(input);
      dispatch(sessionUpserted(session));
      return session;
    } catch {
      toast.error("Couldn't create the War Room");
      return null;
    }
  };

export const renameSession =
  (id: string, title: string) => async (dispatch: AppDispatch) => {
    try {
      const session = await service.updateSession(id, { title });
      dispatch(sessionUpserted(session));
    } catch {
      toast.error("Couldn't rename the War Room");
    }
  };

/** A partial room-identity edit: any of title / description / icon / color. */
export interface RoomIdentityPatch {
  title?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

/**
 * Update a room's IDENTITY (title / description / icon / color) in one write.
 * Optimistic: the slice is patched immediately from the prior row + the edit so
 * the header + gallery card rebrand without waiting on the round-trip; on failure
 * the prior row is restored and the error routed through reportWarRoomError.
 */
export const updateRoomIdentity =
  (id: string, patch: RoomIdentityPatch) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const prior = getState().warRoom.sessionsById[id];
    if (!prior) return false;

    // Normalize: trim title (never blank it out), pass the rest through.
    const next: WarRoomSessionUpdate = {};
    if (patch.title !== undefined) {
      const trimmed = patch.title.trim();
      if (trimmed) next.title = trimmed;
    }
    if (patch.description !== undefined) {
      const d = patch.description?.trim();
      next.description = d ? d : null;
    }
    if (patch.icon !== undefined) next.icon = patch.icon;
    if (patch.color !== undefined) next.color = patch.color;
    if (Object.keys(next).length === 0) return true; // nothing to do

    // Optimistic apply from the live row so the UI rebrands instantly.
    dispatch(sessionUpserted({ ...prior, ...next }));
    try {
      const updated = await service.updateSession(id, next);
      dispatch(sessionUpserted(updated));
      return true;
    } catch (err) {
      dispatch(sessionUpserted(prior)); // restore the pre-edit row
      reportWarRoomError("updateRoomIdentity", err, {
        toast: "Couldn't save the room details",
      });
      return false;
    }
  };

// ── active_tile_id (focused-thread RESTORE) ─────────────────────────────
// The staged/focused tile is ephemeral React-context view state (roomViewContext)
// BY DESIGN — it is NOT moved into Redux/persistence. We only MIRROR the resolved
// focus to the session row so a room reopens on the thread you last had focused:
//   • on OPEN  → seed the initial staged tile from session.active_tile_id (UI side)
//   • on CHANGE → persist the new focus here (debounced, no-op when unchanged).

/**
 * Persist the room's currently-focused tile to ctx_war_room_sessions.active_tile_id.
 * Guarded (skips a no-op write when the row already matches) and updates the slice
 * row so a re-open reads the fresh value. Background work — logs loudly on failure
 * but never toasts (focus restore is a convenience, not a user action).
 */
export const persistActiveTile =
  (sessionId: string, tileId: string | null) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const session = getState().warRoom.sessionsById[sessionId];
    if (!session) return;
    if ((session.active_tile_id ?? null) === (tileId ?? null)) return; // no-op
    try {
      const updated = await service.updateSession(sessionId, {
        active_tile_id: tileId,
      });
      dispatch(sessionUpserted(updated));
    } catch (err) {
      reportWarRoomError("persistActiveTile", err, { toast: false });
    }
  };

export const deleteSession =
  (id: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    // Optimistic removal — on failure re-add the single removed session
    // (targeted, no full network reload) so the list self-heals.
    const prior = getState().warRoom.sessionsById[id];
    dispatch(sessionRemoved(id));
    try {
      await service.softDeleteSession(id);
      toast.success("War Room deleted");
    } catch (err) {
      if (prior) dispatch(sessionUpserted(prior));
      else dispatch(loadSessionsList());
      reportWarRoomError("deleteSession", err, {
        toast: "Couldn't delete the War Room",
      });
    }
  };

/** Load one room fully: session + tiles + audio links, set active, bump opened. */
export const loadWarRoomSession =
  (id: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(setActiveSession(id));
    dispatch(setTilesStatus({ sessionId: id, status: "loading" }));
    try {
      const existing = getState().warRoom.sessionsById[id];
      const [session, tiles] = await Promise.all([
        existing ? Promise.resolve(existing) : service.getSession(id),
        service.listTiles(id),
      ]);

      if (!session) {
        dispatch(setTilesStatus({ sessionId: id, status: "error" }));
        toast.error("War Room not found");
        return null;
      }

      dispatch(sessionUpserted(session));
      dispatch(tilesLoadedForSession({ sessionId: id, tiles }));

      // ONE query for every association across the room + all its threads
      // (notes, tasks, studio sessions, files, documents, conversations).
      const refs: ContainerRef[] = [
        roomRef(id),
        ...tiles.map((t) => threadRef(t.id)),
      ];
      const assignments = await assoc.listAssignmentsForContainers(refs);

      // Seed an (empty) bucket for every container so a tile that lost its last
      // assignment doesn't keep showing a stale one, then group rows by key.
      const byContainer: Record<string, WarRoomAssignment[]> = {};
      for (const ref of refs) byContainer[containerKey(ref.type, ref.id)] = [];
      for (const a of assignments) {
        const key = containerKey(
          a.container_type as ContainerRef["type"],
          a.container_id,
        );
        (byContainer[key] ??= []).push(a);
      }
      dispatch(assignmentsLoadedBulk({ byContainer }));

      // Hydrate the threads' linked tasks into the agent-context slice so the
      // Task tab renders after a fresh load (fire-and-forget).
      const taskIds = assignments
        .filter((a) => a.entity_type === "task")
        .map((a) => a.entity_id);
      void dispatch(hydrateTileTasks(taskIds));

      void service.touchSessionOpened(id);
      return session;
    } catch (err) {
      console.error("[war-room] loadWarRoomSession failed:", err);
      dispatch(setTilesStatus({ sessionId: id, status: "error" }));
      toast.error("Couldn't open the War Room");
      return null;
    }
  };

export const leaveWarRoomSession = (id: string) => (dispatch: AppDispatch) => {
  dispatch(clearSessionTiles(id));
  dispatch(setActiveSession(null));
};

// ── Context (controlled selection carried by the records) ──────────────
// These persist org + scope onto ctx_war_room_* rows ONLY. They NEVER write
// appContextSlice (global active context) or ctx_scope_assignments.

export interface ContextSelectionInput {
  organizationId: string | null;
  scopeIds: string[];
}

export const setSessionContextThunk =
  (sessionId: string, ctx: ContextSelectionInput) =>
  async (dispatch: AppDispatch) => {
    try {
      const updated = await service.updateSession(sessionId, {
        organization_id: ctx.organizationId,
        context_scope_ids: ctx.scopeIds,
      });
      dispatch(sessionUpserted(updated));
    } catch {
      toast.error("Couldn't update the War Room context");
    }
  };

export const setTileContextOverrideThunk =
  (tileId: string, ctx: ContextSelectionInput) =>
  async (dispatch: AppDispatch) => {
    try {
      const updated = await service.updateTile(tileId, {
        context_organization_id: ctx.organizationId,
        context_scope_ids: ctx.scopeIds,
      });
      dispatch(tileUpserted(updated));
    } catch {
      toast.error("Couldn't update the tile context");
    }
  };

/** Reset a tile back to inheriting the session's context (override → NULL). */
export const clearTileContextOverrideThunk =
  (tileId: string) => async (dispatch: AppDispatch) => {
    try {
      const updated = await service.updateTile(tileId, {
        context_organization_id: null,
        context_scope_ids: null,
      });
      dispatch(tileUpserted(updated));
    } catch {
      toast.error("Couldn't reset the tile context");
    }
  };

// ── Tiles ─────────────────────────────────────────────────────────────

export const createTile =
  (input: CreateTileInput) =>
  async (dispatch: AppDispatch): Promise<WarRoomTile | null> => {
    try {
      const tile = await service.createTile(input);
      dispatch(tileUpserted(tile));
      return tile;
    } catch {
      toast.error("Couldn't create the tile");
      return null;
    }
  };

// ── Project flavor + association (the room/tile invariant) ──────────────
// INVARIANT: a room (session.project_id) and its tiles never hold CONFLICTING
// projects. If the room has a project, every tile is NULL (inherits) or equal
// to it. Per-tile projects (different projects on different tiles) are allowed
// ONLY when the room has no project.
// See migrations/ctx_war_room_tiles_flavor_project.sql.

export type ProjectConflictResolution = "per-thread" | "keep-room";

export interface TileProjectConflict {
  /** True when assigning `requestedProjectId` to a tile in this room would
   *  conflict with the room's existing project (room is P, request is a
   *  different Q). */
  hasConflict: boolean;
  /** The room's current project_id (the P in the conflict), or null. */
  roomProjectId: string | null;
}

/**
 * Synchronously decide whether assigning a project to a tile in this room would
 * break the invariant. The UI dispatches this BEFORE creating/associating so it
 * knows whether to prompt the user to choose a resolution.
 */
export const checkTileProjectConflict =
  (sessionId: string, requestedProjectId: string | null) =>
  (_dispatch: AppDispatch, getState: () => RootState): TileProjectConflict => {
    const roomProjectId =
      getState().warRoom.sessionsById[sessionId]?.project_id ?? null;
    return {
      hasConflict:
        requestedProjectId != null &&
        roomProjectId != null &&
        roomProjectId !== requestedProjectId,
      roomProjectId,
    };
  };

/** Set a tile's flavor (thread | task | project) without touching its project. */
export const setTileFlavorThunk =
  (tileId: string, flavor: TileFlavor) => async (dispatch: AppDispatch) => {
    try {
      const updated = await service.updateTile(tileId, { flavor });
      dispatch(tileUpserted(updated));
    } catch {
      toast.error("Couldn't change the tile type");
    }
  };

/**
 * Switch a room from "whole-room project" to "per-thread": stamp the room's
 * project onto every existing tile that lacks one, THEN clear the room's
 * project. Order matters — stamp before clear so the association is never lost
 * and the invariant holds throughout. No-op if the room has no project.
 */
export const convertRoomToPerThreadThunk =
  (sessionId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const roomProjectId =
      getState().warRoom.sessionsById[sessionId]?.project_id ?? null;
    if (!roomProjectId) return true; // already per-thread / no project

    // The tiles `applyProjectToAllTiles` will stamp are exactly those with a
    // NULL project_id (it filters .is("project_id", null)). Capture them so a
    // mid-flight failure clearing the room can be fully rolled back — the room
    // & its tiles must NEVER be left holding conflicting projects.
    let stamped: WarRoomTile[] = [];
    try {
      stamped = await service.applyProjectToAllTiles(sessionId, roomProjectId);
      const updatedSession = await service.updateSession(sessionId, {
        project_id: null,
      });
      for (const t of stamped) dispatch(tileUpserted(t));
      dispatch(sessionUpserted(updatedSession));
      return true;
    } catch (err) {
      // Compensating rollback: un-stamp every tile we just stamped so the room
      // (still holding its project) doesn't end up conflicting with them. Best
      // effort — any rollback failure is itself reported loudly.
      await Promise.all(
        stamped.map((t) =>
          service
            .updateTile(t.id, { project_id: null })
            .then((reverted) => dispatch(tileUpserted(reverted)))
            .catch((rollbackErr) =>
              reportWarRoomError(
                "convertRoomToPerThreadThunk:rollback",
                rollbackErr,
                { toast: false },
              ),
            ),
        ),
      );
      reportWarRoomError("convertRoomToPerThreadThunk", err, {
        toast: "Couldn't switch to per-thread projects",
      });
      return false;
    }
  };

/**
 * Associate (or re-point / clear) a tile's project. The caller must resolve any
 * conflict FIRST (checkTileProjectConflict + a prompt) and pass `resolution`:
 *   • 'per-thread' — convert the room to per-thread, then give this tile its
 *      requested project.
 *   • 'keep-room'  — ignore the request; the tile JOINS the room's project.
 * With no conflict, `resolution` is unused. projectId=null clears the tile's
 * project (a project-flavor tile reverts to 'thread'; a task tile stays 'task').
 */
export const setTileProjectThunk =
  (
    tileId: string,
    projectId: string | null,
    resolution?: ProjectConflictResolution,
  ) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const tile = getState().warRoom.tilesById[tileId];
    if (!tile) return false;
    const { hasConflict, roomProjectId } = checkTileProjectConflict(
      tile.session_id,
      projectId,
    )(dispatch, getState);

    let finalProjectId = projectId;
    if (hasConflict) {
      if (resolution === "keep-room") {
        finalProjectId = roomProjectId; // join the room's project instead
      } else if (resolution === "per-thread") {
        const ok = await dispatch(convertRoomToPerThreadThunk(tile.session_id));
        if (!ok) return false; // room project now null → requested id is safe
      } else {
        // Caller passed an unresolved real conflict — refuse rather than corrupt.
        console.warn(
          "[war-room] setTileProjectThunk refused: unresolved project conflict",
        );
        return false;
      }
    }

    try {
      const patch: WarRoomTileUpdate = { project_id: finalProjectId };
      // A tile gains 'project' flavor when given a project; clearing reverts a
      // project tile to a generic thread (a task-flavored tile stays 'task').
      if (finalProjectId) patch.flavor = "project";
      else if (tile.flavor === "project") patch.flavor = "thread";
      const updated = await service.updateTile(tileId, patch);
      dispatch(tileUpserted(updated));
      return true;
    } catch {
      toast.error("Couldn't update the tile's project");
      return false;
    }
  };

/**
 * Associate the ROOM with a project (whole-room mode), or clear it (null). The
 * UI should only call this when no tile carries a DIFFERENT project (otherwise
 * use the conflict prompt). Clearing leaves any per-tile projects intact.
 */
export const setRoomProjectThunk =
  (sessionId: string, projectId: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const updated = await service.updateSession(sessionId, {
        project_id: projectId,
      });
      dispatch(sessionUpserted(updated));
      return true;
    } catch {
      toast.error("Couldn't associate the room with the project");
      return false;
    }
  };

/**
 * Make the WHOLE room one project (the mirror of convertRoomToPerThread): clear
 * any per-tile project that DIFFERS from `projectId` (those tiles fall back to
 * inheriting the room's), then set the room's project. Used when the user picks
 * "one project for the whole room" while some threads carry their own.
 */
export const absorbRoomIntoProjectThunk =
  (sessionId: string, projectId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const tileIds = getState().warRoom.tileIdsBySession[sessionId] ?? [];
    // Remember each tile we clear so a mid-loop / session-update failure can be
    // rolled back — the room must NOT end up project-less while its tiles have
    // already been stripped (or vice-versa).
    const cleared: { id: string; priorProjectId: string }[] = [];
    try {
      for (const id of tileIds) {
        const t = getState().warRoom.tilesById[id];
        if (t?.project_id && t.project_id !== projectId) {
          const priorProjectId = t.project_id;
          const updated = await service.updateTile(id, { project_id: null });
          dispatch(tileUpserted(updated));
          cleared.push({ id, priorProjectId });
        }
      }
      const updatedSession = await service.updateSession(sessionId, {
        project_id: projectId,
      });
      dispatch(sessionUpserted(updatedSession));
      return true;
    } catch (err) {
      // Compensating rollback: restore every per-tile project we cleared so no
      // inconsistent room/tile project state survives the failure.
      await Promise.all(
        cleared.map(({ id, priorProjectId }) =>
          service
            .updateTile(id, { project_id: priorProjectId })
            .then((reverted) => dispatch(tileUpserted(reverted)))
            .catch((rollbackErr) =>
              reportWarRoomError(
                "absorbRoomIntoProjectThunk:rollback",
                rollbackErr,
                {
                  toast: false,
                },
              ),
            ),
        ),
      );
      reportWarRoomError("absorbRoomIntoProjectThunk", err, {
        toast: "Couldn't set the room project",
      });
      return false;
    }
  };

/**
 * Create a NEW room associated with an existing project and seed one
 * project-flavor tile pointing at it (the project's command tile). The room's
 * project_id makes the whole room "about" the project; the seeded tile's Task
 * tab lists/creates the project's tasks. Returns the created session.
 */
export const createRoomFromProject =
  (
    projectId: string,
    projectName?: string | null,
    organizationId?: string | null,
  ) =>
  async (dispatch: AppDispatch): Promise<WarRoomSession | null> => {
    try {
      const session = await service.createSession({
        title: projectName?.trim() || "Project room",
        projectId,
        organizationId: organizationId ?? null,
      });
      dispatch(sessionUpserted(session));
      const tile = await service.createTile({
        sessionId: session.id,
        flavor: "project",
        projectId,
        activeTab: "task",
        title: projectName?.trim() || null,
        position: 0,
      });
      dispatch(tileUpserted(tile));
      return session;
    } catch {
      toast.error("Couldn't open a room for the project");
      return null;
    }
  };

// Coalesce concurrent lazy-create calls per (op, tileId) so a rapid
// double-mount / double-click can't mint two notes / tasks / audio sessions
// for the same tile. Keyed strings like "note:<tileId>".
const inFlightTileOps = new Set<string>();

/**
 * A human, trackable label for a tile's note — derived from the room name + the
 * thread (its own title, else its task's title, else its ordinal in the room),
 * disambiguated by note index. Replaces the generic "War Room note" that was the
 * SAME for every room and thread and littered the user's notes list.
 */
function deriveTileNoteLabel(state: RootState, tileId: string): string {
  const tile = state.warRoom.tilesById[tileId];
  const sessionId = tile?.session_id ?? null;
  const roomName =
    (sessionId && state.warRoom.sessionsById[sessionId]?.title?.trim()) ||
    "War Room";
  const taskId = selectTileTaskId(tileId)(state);
  const taskTitle = taskId
    ? selectTaskById(state, taskId)?.title?.trim()
    : undefined;
  const ordinal = sessionId
    ? (state.warRoom.tileIdsBySession[sessionId]?.indexOf(tileId) ?? -1)
    : -1;
  const threadLabel =
    tile?.title?.trim() ||
    taskTitle ||
    (ordinal >= 0 ? `Thread ${ordinal + 1}` : "Thread");
  const base =
    threadLabel === roomName ? roomName : `${roomName} — ${threadLabel}`;
  // Index among the tile's existing notes — the 2nd+ note gets a "(N)" suffix.
  const existing = selectNoteIdsForTile(tileId)(state).length;
  const n = existing + 1;
  return n > 1 ? `${base} (${n})` : base;
}

/**
 * Ensure the tile's Notes tab has a backing note. Creates one via the notes
 * programmatic API (no notes-page tab side effects), registers it in the notes
 * slice, links it to the tile, and keeps note.task_id in sync with the tile.
 */
export const createTileNote =
  (tileId: string, sessionId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const key = `note:${tileId}`;
    const tile = getState().warRoom.tilesById[tileId];
    const existingNote = selectActiveNoteId(tileId)(getState());
    if (!tile || existingNote) return existingNote;
    if (inFlightTileOps.has(key)) return null;
    inFlightTileOps.add(key);
    try {
      const note = await createNote({
        content: "",
        label: deriveTileNoteLabel(getState(), tileId),
        task_id: selectTileTaskId(tileId)(getState()) ?? undefined,
      });
      dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
      const assignment = await assoc.createAssignment({
        ref: threadRef(tileId),
        entityType: "note",
        entityId: note.id,
      });
      dispatch(
        assignmentUpserted({ key: containerKey("thread", tileId), assignment }),
      );
      return note.id;
    } catch (err) {
      reportWarRoomError("createTileNote", err, {
        toast: "Couldn't create the note",
      });
      return null;
    } finally {
      inFlightTileOps.delete(key);
    }
  };

/** Map a ctx_tasks row to the agent-context TaskRecord shape (full-data). */
function toTaskRecord(
  t: NonNullable<Awaited<ReturnType<typeof taskService.getTaskById>>>,
): TaskRecord {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    assignee_id: t.assignee_id,
    project_id: t.project_id,
    parent_task_id: t.parent_task_id,
    organization_id: t.organization_id ?? "",
    description: t.description,
    created_at: t.created_at,
    user_id: t.user_id,
  };
}

/**
 * Create a task and anchor it to the tile. The created task lands in the
 * agent-context tasks slice (createTaskThunk upserts it); we link it to the
 * tile and keep the tile's note associated with the same task.
 */
export const createTileTask =
  (tileId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const key = `task:${tileId}`;
    const tile = getState().warRoom.tilesById[tileId];
    const existingTask = selectTileTaskId(tileId)(getState());
    if (!tile || existingTask) return existingTask;
    if (inFlightTileOps.has(key)) return null;
    inFlightTileOps.add(key);
    try {
      // Stamp the task with the TILE's context, not the global active context
      // — honors the War Room invariant (carries its own context). Also stamp
      // the tile's EFFECTIVE project so a task created under a project room /
      // project tile auto-associates app-wide (ctx_tasks.project_id).
      const ctx = selectTileEffectiveContext(tileId)(getState());
      const projectId = selectEffectiveTileProjectId(tileId)(getState());
      const taskId = await dispatch(
        createTaskThunk({
          title: "New task",
          organizationId: ctx.organizationId,
          scopeIds: ctx.scopeIds,
          projectId,
        }),
      ).unwrap();
      if (!taskId) return null;
      const taskAssignment = await assoc.createAssignment({
        ref: threadRef(tileId),
        entityType: "task",
        entityId: taskId,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", tileId),
          assignment: taskAssignment,
        }),
      );
      // Keep ALL of the tile's linked notes associated with the task (best effort).
      const noteIds = selectNoteIdsForTile(tileId)(getState());
      await Promise.all(
        noteIds.map((noteId) =>
          updateNoteApi(noteId, { task_id: taskId }).catch((err) =>
            // The task IS created; the note→task link is what failed. Surface it
            // loudly so a note silently failing to link is no longer invisible.
            reportWarRoomError("createTileTask", err, {
              toast: "Created the task, but couldn't link a note to it",
            }),
          ),
        ),
      );
      return taskId;
    } catch (err) {
      reportWarRoomError("createTileTask", err, {
        toast: "Couldn't create the task",
      });
      return null;
    } finally {
      inFlightTileOps.delete(key);
    }
  };

/** Load a task's subtasks into the agent-context slice so they survive a fresh
 *  room load (hydrateTileTasks only loads the parent). Idempotent. */
export const loadTileSubtasks =
  (taskId: string) => async (dispatch: AppDispatch) => {
    try {
      const subs = await taskService.getSubtasks(taskId);
      for (const s of subs) {
        dispatch(
          upsertTaskWithLevel({ record: toTaskRecord(s), level: "full-data" }),
        );
      }
    } catch {
      /* non-fatal */
    }
  };

/** Pull the threads' linked tasks into the agent-context slice so the Task tab
 *  can render them after a fresh room load. Fire-and-forget. */
export const hydrateTileTasks =
  (taskIds: string[]) => async (dispatch: AppDispatch) => {
    const unique = [...new Set(taskIds.filter((id): id is string => !!id))];
    if (unique.length === 0) return;
    const tasks = await Promise.all(
      unique.map((id) => taskService.getTaskById(id)),
    );
    for (const t of tasks) {
      if (t)
        dispatch(
          upsertTaskWithLevel({ record: toTaskRecord(t), level: "full-data" }),
        );
    }
  };

// ── Audio (transcript sessions per tile) ───────────────────────────────
// Reuses the transcript-studio system: each tile audio session is a real
// studio_sessions row (source='war_room', invisible to the Studio list) linked
// via ctx_war_room_tile_audio_sessions. Raw transcript persists to
// studio_raw_segments and renders from the transcriptStudio slice.

/** Create a new audio (transcript) session for a tile and make it active. */
export const addAudioSessionToTile =
  (tileId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const key = `audio:${tileId}`;
    if (inFlightTileOps.has(key)) return null;
    inFlightTileOps.add(key);
    try {
      const userId = requireUserId();
      const ctx = selectTileEffectiveContext(tileId)(getState());
      const session = await dispatch(
        createSessionThunk({
          userId,
          source: WAR_ROOM_AUDIO_SOURCE,
          title: "Recording",
          organizationId: ctx.organizationId,
        }),
      ).unwrap();
      if (!session) return null;
      const assignment = await assoc.createAssignment({
        ref: threadRef(tileId),
        entityType: "studio_session",
        entityId: session.id,
      });
      dispatch(
        assignmentUpserted({ key: containerKey("thread", tileId), assignment }),
      );
      return session.id;
    } catch (err) {
      reportWarRoomError("addAudioSessionToTile", err, {
        toast: "Couldn't start an audio session",
      });
      return null;
    } finally {
      inFlightTileOps.delete(key);
    }
  };

/** Switch which of a tile's audio sessions is active (persists + loads it). */
export const setTileActiveAudioSession =
  (tileId: string, studioSessionId: string) =>
  async (dispatch: AppDispatch) => {
    dispatch(
      assignmentActiveSet({
        key: containerKey("thread", tileId),
        entityType: "studio_session",
        entityId: studioSessionId,
      }),
    );
    dispatch(fetchRawSegmentsThunk({ sessionId: studioSessionId }));
    try {
      await assoc.setActiveAssignment(
        threadRef(tileId),
        "studio_session",
        studioSessionId,
      );
    } catch (err) {
      reportWarRoomError("setTileActiveAudioSession", err, {
        toast: "Couldn't switch the audio session",
      });
    }
  };

/** Return the tile's active audio session, creating one if needed. */
export const ensureTileAudioSession =
  (tileId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const active = selectActiveAudioSessionId(tileId)(getState());
    if (active) {
      dispatch(fetchRawSegmentsThunk({ sessionId: active }));
      return active;
    }
    return dispatch(addAudioSessionToTile(tileId));
  };

// ── Notes (multiple notes per tile) ────────────────────────────────────
// Mirror of the audio sessions: each tile note is a real `notes` row linked
// via a 'note' assignment row (ctx_war_room_assignments). One assignment per
// note carries is_active; the active note drives note↔task sync + tile metrics.

/** Create a fresh note for a tile, link it, and make it the active one. */
export const addNoteToTile =
  (tileId: string, _sessionId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const key = `note:${tileId}`;
    if (inFlightTileOps.has(key)) return null;
    inFlightTileOps.add(key);
    try {
      const note = await createNote({
        content: "",
        label: deriveTileNoteLabel(getState(), tileId),
        task_id: selectTileTaskId(tileId)(getState()) ?? undefined,
      });
      dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
      const assignment = await assoc.createAssignment({
        ref: threadRef(tileId),
        entityType: "note",
        entityId: note.id,
      });
      dispatch(
        assignmentUpserted({ key: containerKey("thread", tileId), assignment }),
      );
      return note.id;
    } catch (err) {
      reportWarRoomError("addNoteToTile", err, {
        toast: "Couldn't create the note",
      });
      return null;
    } finally {
      inFlightTileOps.delete(key);
    }
  };

/** Switch which of a tile's notes is active (optimistic; persists pointer). */
export const setTileActiveNote =
  (tileId: string, noteId: string) => async (dispatch: AppDispatch) => {
    dispatch(
      assignmentActiveSet({
        key: containerKey("thread", tileId),
        entityType: "note",
        entityId: noteId,
      }),
    );
    try {
      await assoc.setActiveAssignment(threadRef(tileId), "note", noteId);
    } catch (err) {
      reportWarRoomError("setTileActiveNote", err, {
        toast: "Couldn't switch the note",
      });
    }
  };

/** Return the tile's active note, creating one if needed. */
export const ensureTileNote =
  (tileId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const active = selectActiveNoteId(tileId)(getState());
    if (active) return active;
    const tile = getState().warRoom.tilesById[tileId];
    return dispatch(addNoteToTile(tileId, tile?.session_id ?? ""));
  };

export const deleteTile =
  (id: string, sessionId: string) => async (dispatch: AppDispatch) => {
    dispatch(tileRemoved({ id, sessionId }));
    try {
      await service.softDeleteTile(id);
    } catch {
      toast.error("Couldn't remove the tile");
    }
  };

export const setTileActiveTabPersisted =
  (id: string, tab: TileTab) => async (dispatch: AppDispatch) => {
    dispatch(setTileActiveTab({ id, tab }));
    try {
      await service.updateTile(id, { active_tab: tab });
    } catch {
      /* tab is a soft preference; swallow */
    }
  };

export const renameTile =
  (id: string, title: string) => async (dispatch: AppDispatch) => {
    const trimmed = title.trim();
    try {
      const updated = await service.updateTile(id, { title: trimmed || null });
      dispatch(tileUpserted(updated));
    } catch {
      toast.error("Couldn't rename the tile");
    }
  };

export const toggleTilePin =
  (id: string, pinned: boolean) => async (dispatch: AppDispatch) => {
    dispatch(setTilePinned({ id, pinned }));
    try {
      await service.updateTile(id, { is_pinned: pinned });
    } catch (err) {
      dispatch(setTilePinned({ id, pinned: !pinned }));
      reportWarRoomError("toggleTilePin", err, {
        toast: "Couldn't update pin",
      });
    }
  };

export const toggleTileHide =
  (id: string, hidden: boolean) => async (dispatch: AppDispatch) => {
    dispatch(setTileHidden({ id, hidden }));
    try {
      await service.updateTile(id, { is_hidden: hidden });
    } catch (err) {
      dispatch(setTileHidden({ id, hidden: !hidden }));
      reportWarRoomError("toggleTileHide", err, {
        toast: "Couldn't update tile",
      });
    }
  };

export const persistTilePositions =
  (updates: { id: string; position: number }[]) =>
  async (_dispatch: AppDispatch) => {
    try {
      await service.persistTilePositions(updates);
    } catch {
      toast.error("Couldn't save tile order");
    }
  };

// ── Attachments (files + documents per tile) ───────────────────────────
// Polymorphic links to cld_files (entity_type='user_file') and udt_documents
// (entity_type='document'). The linked entity stays in its own feature; the
// attachment row is just the link. Display details are hydrated client-side in
// the Files tab (useFile for files, document-service for documents).

/** Refresh a tile's full assignment bucket (Files tab mount / isolated tile). */
export const loadTileAttachments =
  (tileId: string) => async (dispatch: AppDispatch) => {
    try {
      const assignments = await assoc.listAssignmentsForContainer(
        threadRef(tileId),
      );
      dispatch(
        assignmentsLoadedForContainer({
          key: containerKey("thread", tileId),
          assignments,
        }),
      );
    } catch (err) {
      // Background load — log loudly (so a failure is no longer invisible) but
      // don't toast; the section just shows empty.
      reportWarRoomError("loadTileAttachments", err, { toast: false });
    }
  };

// Re-attaching an already-linked resource is no longer an error: createAssignment
// upserts via assoc_add (ON CONFLICT) and returns the existing row, so there is no
// 23505 to special-case. The catch blocks below handle only genuine failures.

/** Link an existing/just-uploaded cloud file (cld_files.id) to a tile. */
export const attachFileToTile =
  (tileId: string, fileId: string, label?: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(tileId),
        entityType: "user_file",
        entityId: fileId,
        label,
      });
      dispatch(
        assignmentUpserted({ key: containerKey("thread", tileId), assignment }),
      );
      return true;
    } catch (err) {
      reportWarRoomError("attachFileToTile", err, {
        toast: "Couldn't attach the file",
      });
      return false;
    }
  };

/** Link a document (udt_documents.id) to a tile. */
export const attachDocumentToTile =
  (tileId: string, documentId: string, label?: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(tileId),
        entityType: "document",
        entityId: documentId,
        label,
      });
      dispatch(
        assignmentUpserted({ key: containerKey("thread", tileId), assignment }),
      );
      return true;
    } catch (err) {
      reportWarRoomError("attachDocumentToTile", err, {
        toast: "Couldn't attach the document",
      });
      return false;
    }
  };

/**
 * Link an agent conversation (cx_conversation.id) to a tile — so a thread "holds"
 * its agent conversations as first-class associations (the durable thread agent
 * registers its conversation here). Idempotent: re-linking the same conversation
 * is a no-op. NEW capability the association model unlocks.
 */
export const attachConversationToTile =
  (tileId: string, conversationId: string, label?: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(tileId),
        entityType: "conversation",
        entityId: conversationId,
        label,
        makeActive: true,
      });
      dispatch(
        assignmentUpserted({ key: containerKey("thread", tileId), assignment }),
      );
      return true;
    } catch (err) {
      reportWarRoomError("attachConversationToTile", err, { toast: false });
      return false;
    }
  };

// ── Thread portability (move / import between rooms) ───────────────────
// A thread (tile) and its resources are a portable unit: its assignments are
// keyed by the tile id (container_id), so MOVING a thread is just re-pointing
// its session_id — every resource travels with it. IMPORTING copies the thread
// + its assignment rows into another room, leaving the original intact. This is
// how a user spins up a fresh room and pulls a still-relevant thread across as
// the old room winds down.

/** Move a thread into another room (re-point session_id; resources travel along). */
export const moveThreadToRoom =
  (tileId: string, targetSessionId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const tile = getState().warRoom.tilesById[tileId];
    if (!tile) return false;
    const fromSessionId = tile.session_id;
    if (fromSessionId === targetSessionId) return true; // already there
    try {
      const updated = await service.updateTile(tileId, {
        session_id: targetSessionId,
      });
      dispatch(
        tileSessionChanged({
          id: tileId,
          fromSessionId,
          toSessionId: targetSessionId,
        }),
      );
      dispatch(tileUpserted(updated));
      toast.success("Thread moved");
      return true;
    } catch (err) {
      reportWarRoomError("moveThreadToRoom", err, {
        toast: "Couldn't move the thread",
      });
      return false;
    }
  };

/**
 * Import a COPY of a thread into another room: duplicate the tile (its identity)
 * and copy its assignment rows onto the new tile, leaving the source untouched.
 * Returns the new tile id (null on failure).
 */
export const importThreadToRoom =
  (tileId: string, targetSessionId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const tile = getState().warRoom.tilesById[tileId];
    if (!tile) return null;
    try {
      const position =
        getState().warRoom.tileIdsBySession[targetSessionId]?.length ?? 0;
      const newTile = await service.createTile({
        sessionId: targetSessionId,
        title: tile.title,
        flavor: (tile.flavor as TileFlavor) ?? "thread",
        projectId: tile.project_id,
        activeTab: (tile.active_tab as TileTab) ?? "task",
        position,
      });
      dispatch(tileUpserted(newTile));
      // Copy every resource assignment onto the new thread.
      const copied = await assoc.copyContainerAssignments(
        threadRef(tileId),
        threadRef(newTile.id),
      );
      dispatch(
        assignmentsLoadedForContainer({
          key: containerKey("thread", newTile.id),
          assignments: copied,
        }),
      );
      toast.success("Thread imported");
      return newTile.id;
    } catch (err) {
      reportWarRoomError("importThreadToRoom", err, {
        toast: "Couldn't import the thread",
      });
      return null;
    }
  };

/** Remove a tile's attachment link (the file/document itself is untouched). */
export const detachTileAttachment =
  (tileId: string, attachment: WarRoomAssignment) =>
  async (dispatch: AppDispatch) => {
    // Optimistic — the link is cheap to re-create.
    dispatch(
      assignmentRemoved({
        key: containerKey("thread", tileId),
        id: attachment.id,
      }),
    );
    try {
      await assoc.removeAssignmentByEntity(
        threadRef(tileId),
        attachment.entity_type as WarRoomAssignmentEntityType,
        attachment.entity_id,
      );
    } catch (err) {
      dispatch(loadTileAttachments(tileId));
      reportWarRoomError("detachTileAttachment", err, {
        toast: "Couldn't remove the attachment",
      });
    }
  };
