// features/war-room/redux/thunks.ts
//
// Async thunks bridging the warRoom slice and Supabase via service.ts.
// Optimistic where it helps; loud (toast) on failure.

import { toast } from "sonner";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { create as createNote, update as updateNoteApi } from "@/features/notes/service/notesApi";
import { upsertNoteFromServer } from "@/features/notes/redux/slice";
import { createTaskThunk } from "@/features/tasks/redux/thunks";
import { upsertTaskWithLevel } from "@/features/agent-context/redux/tasksSlice";
import type { TaskRecord } from "@/features/agent-context/redux/tasksSlice";
import * as taskService from "@/features/tasks/services/taskService";
import { requireUserId } from "@/utils/auth/getUserId";
import {
  createSessionThunk,
  fetchRawSegmentsThunk,
} from "@/features/transcript-studio/redux/thunks";
import { WAR_ROOM_AUDIO_SOURCE } from "../constants";
import {
  selectEffectiveTileProjectId,
  selectTileEffectiveContext,
} from "./selectors";
import * as service from "../service";
import type {
  CreateSessionInput,
  CreateTileInput,
  TileFlavor,
  TileTab,
  WarRoomSession,
  WarRoomTile,
  WarRoomTileUpdate,
} from "../types";
import {
  attachmentRemoved,
  attachmentsLoadedForTile,
  attachmentUpserted,
  audioSessionLinkedToTile,
  audioSessionsLoadedForTile,
  clearSessionTiles,
  noteLinkedToTile,
  noteSessionsLoadedForTile,
  setActiveAudioSession,
  setActiveNote,
  sessionRemoved,
  sessionsLoaded,
  sessionUpserted,
  setActiveSession,
  setListError,
  setListStatus,
  setTileActiveTab,
  setTileHidden,
  setTileLink,
  setTilePinned,
  setTilesStatus,
  tileRemoved,
  tilesLoadedForSession,
  tileUpserted,
} from "./slice";

// ── Sessions ──────────────────────────────────────────────────────────

export const loadSessionsList = () => async (dispatch: AppDispatch) => {
  dispatch(setListStatus("loading"));
  try {
    const sessions = await service.listSessions();
    dispatch(sessionsLoaded(sessions));
    return sessions;
  } catch (err) {
    dispatch(setListError(err instanceof Error ? err.message : "Failed to load"));
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

export const deleteSession = (id: string) => async (dispatch: AppDispatch) => {
  // Optimistic removal — revert by reload on failure.
  dispatch(sessionRemoved(id));
  try {
    await service.softDeleteSession(id);
    toast.success("War Room deleted");
  } catch {
    toast.error("Couldn't delete the War Room");
    dispatch(loadSessionsList());
  }
};

/** Load one room fully: session + tiles + audio links, set active, bump opened. */
export const loadWarRoomSession =
  (id: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
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
      // Hydrate linked tasks into the agent-context slice (fire-and-forget).
      void dispatch(hydrateTileTasks(tiles));

      // Audio links keyed off the tiles we just fetched (no extra listTiles).
      const audioLinks = await service.listAudioLinksForTiles(
        tiles.map((t) => t.id),
      );

      // Group audio links per tile.
      const byTile = new Map<
        string,
        { ids: string[]; activeId: string | null }
      >();
      for (const link of audioLinks) {
        const entry = byTile.get(link.tile_id) ?? { ids: [], activeId: null };
        entry.ids.push(link.studio_session_id);
        if (link.is_active) entry.activeId = link.studio_session_id;
        byTile.set(link.tile_id, entry);
      }
      for (const [tileId, { ids, activeId }] of byTile) {
        dispatch(
          audioSessionsLoadedForTile({
            tileId,
            studioSessionIds: ids,
            activeId: activeId ?? ids[0] ?? null,
          }),
        );
      }

      // Note links keyed off the same tiles (mirror of the audio batch).
      const noteLinks = await service.listNoteLinksForTiles(
        tiles.map((t) => t.id),
      );

      const notesByTile = new Map<
        string,
        { ids: string[]; activeId: string | null }
      >();
      for (const link of noteLinks) {
        const entry = notesByTile.get(link.tile_id) ?? { ids: [], activeId: null };
        entry.ids.push(link.note_id);
        if (link.is_active) entry.activeId = link.note_id;
        notesByTile.set(link.tile_id, entry);
      }
      // A tile may carry a note_id (the backfilled/active pointer) without a
      // link row yet — resolve it so it still appears as the active note.
      for (const tile of tiles) {
        if (tile.note_id && !notesByTile.has(tile.id)) {
          notesByTile.set(tile.id, {
            ids: [tile.note_id],
            activeId: tile.note_id,
          });
        }
      }
      for (const [tileId, { ids, activeId }] of notesByTile) {
        dispatch(
          noteSessionsLoadedForTile({
            tileId,
            noteIds: ids,
            activeId: activeId ?? ids[0] ?? null,
          }),
        );
      }

      // Attachment links (files + documents) keyed off the same tiles. Group
      // per tile and seed each tile's list — including empty lists so a tile
      // that lost its only attachment doesn't keep showing a stale one.
      const attachments = await service.listAttachmentsForTiles(
        tiles.map((t) => t.id),
      );
      const attachmentsByTile = new Map<string, typeof attachments>();
      for (const tile of tiles) attachmentsByTile.set(tile.id, []);
      for (const a of attachments) {
        const list = attachmentsByTile.get(a.tile_id) ?? [];
        list.push(a);
        attachmentsByTile.set(a.tile_id, list);
      }
      for (const [tileId, list] of attachmentsByTile) {
        dispatch(attachmentsLoadedForTile({ tileId, attachments: list }));
      }

      void service.touchSessionOpened(id);
      return session;
    } catch (err) {
      console.error("[war-room] loadWarRoomSession failed:", err);
      dispatch(setTilesStatus({ sessionId: id, status: "error" }));
      toast.error("Couldn't open the War Room");
      return null;
    }
  };

export const leaveWarRoomSession =
  (id: string) => (dispatch: AppDispatch) => {
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
  async (dispatch: AppDispatch, getState: () => RootState): Promise<boolean> => {
    const roomProjectId =
      getState().warRoom.sessionsById[sessionId]?.project_id ?? null;
    if (!roomProjectId) return true; // already per-thread / no project
    try {
      const stamped = await service.applyProjectToAllTiles(
        sessionId,
        roomProjectId,
      );
      const updatedSession = await service.updateSession(sessionId, {
        project_id: null,
      });
      for (const t of stamped) dispatch(tileUpserted(t));
      dispatch(sessionUpserted(updatedSession));
      return true;
    } catch {
      toast.error("Couldn't switch to per-thread projects");
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
  async (dispatch: AppDispatch, getState: () => RootState): Promise<boolean> => {
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
  async (dispatch: AppDispatch, getState: () => RootState): Promise<boolean> => {
    try {
      const tileIds = getState().warRoom.tileIdsBySession[sessionId] ?? [];
      for (const id of tileIds) {
        const t = getState().warRoom.tilesById[id];
        if (t?.project_id && t.project_id !== projectId) {
          const updated = await service.updateTile(id, { project_id: null });
          dispatch(tileUpserted(updated));
        }
      }
      const updatedSession = await service.updateSession(sessionId, {
        project_id: projectId,
      });
      dispatch(sessionUpserted(updatedSession));
      return true;
    } catch {
      toast.error("Couldn't set the room project");
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
 * Ensure the tile's Notes tab has a backing note. Creates one via the notes
 * programmatic API (no notes-page tab side effects), registers it in the notes
 * slice, links it to the tile, and keeps note.task_id in sync with the tile.
 */
export const createTileNote =
  (tileId: string, sessionId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const key = `note:${tileId}`;
    const tile = getState().warRoom.tilesById[tileId];
    if (!tile || tile.note_id) return tile?.note_id ?? null;
    if (inFlightTileOps.has(key)) return null;
    inFlightTileOps.add(key);
    try {
      const note = await createNote({
        content: "",
        label: "War Room note",
        task_id: tile.task_id ?? undefined,
      });
      dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
      await service.createTileNoteLink(tileId, note.id);
      dispatch(setTileLink({ id: tileId, noteId: note.id }));
      dispatch(noteLinkedToTile({ tileId, noteId: note.id }));
      return note.id;
    } catch {
      toast.error("Couldn't create the note");
      return null;
    } finally {
      inFlightTileOps.delete(key);
    }
  };

/** Map a ctx_tasks row to the agent-context TaskRecord shape (full-data). */
function toTaskRecord(t: NonNullable<Awaited<ReturnType<typeof taskService.getTaskById>>>): TaskRecord {
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
    if (!tile || tile.task_id) return tile?.task_id ?? null;
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
      await service.updateTile(tileId, { task_id: taskId });
      dispatch(setTileLink({ id: tileId, taskId }));
      // Keep ALL of the tile's linked notes associated with the task (best
      // effort). Fall back to the tile's note_id pointer if no links loaded.
      const linkedNoteIds = getState().warRoom.noteIdsByTile[tileId];
      const noteIds =
        linkedNoteIds && linkedNoteIds.length > 0
          ? linkedNoteIds
          : tile.note_id
            ? [tile.note_id]
            : [];
      for (const noteId of noteIds) {
        updateNoteApi(noteId, { task_id: taskId }).catch(() => {});
      }
      return taskId;
    } catch {
      toast.error("Couldn't create the task");
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
        dispatch(upsertTaskWithLevel({ record: toTaskRecord(s), level: "full-data" }));
      }
    } catch {
      /* non-fatal */
    }
  };

/** Pull the tiles' linked tasks into the agent-context slice so the Task tab
 *  can render them after a fresh room load. Fire-and-forget. */
export const hydrateTileTasks =
  (tiles: WarRoomTile[]) => async (dispatch: AppDispatch) => {
    const taskIds = [
      ...new Set(tiles.map((t) => t.task_id).filter((id): id is string => !!id)),
    ];
    if (taskIds.length === 0) return;
    const tasks = await Promise.all(taskIds.map((id) => taskService.getTaskById(id)));
    for (const t of tasks) {
      if (t) dispatch(upsertTaskWithLevel({ record: toTaskRecord(t), level: "full-data" }));
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
  async (dispatch: AppDispatch, getState: () => RootState): Promise<string | null> => {
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
      await service.createTileAudioLink(tileId, session.id);
      dispatch(
        audioSessionLinkedToTile({ tileId, studioSessionId: session.id }),
      );
      return session.id;
    } catch {
      toast.error("Couldn't start an audio session");
      return null;
    } finally {
      inFlightTileOps.delete(key);
    }
  };

/** Switch which of a tile's audio sessions is active (persists + loads it). */
export const setTileActiveAudioSession =
  (tileId: string, studioSessionId: string) =>
  async (dispatch: AppDispatch) => {
    dispatch(setActiveAudioSession({ tileId, studioSessionId }));
    dispatch(fetchRawSegmentsThunk({ sessionId: studioSessionId }));
    try {
      await service.setActiveTileAudioLink(tileId, studioSessionId);
    } catch {
      toast.error("Couldn't switch the audio session");
    }
  };

/** Return the tile's active audio session, creating one if needed. */
export const ensureTileAudioSession =
  (tileId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<string | null> => {
    const active = getState().warRoom.activeAudioSessionByTile[tileId];
    if (active) {
      dispatch(fetchRawSegmentsThunk({ sessionId: active }));
      return active;
    }
    return dispatch(addAudioSessionToTile(tileId));
  };

// ── Notes (multiple notes per tile) ────────────────────────────────────
// Mirror of the audio sessions: each tile note is a real `notes` row linked
// via ctx_war_room_tile_notes. The active note also lives on tile.note_id
// (the is_active analog) so note↔task sync + tile metrics keep working.

/** Create a fresh note for a tile, link it, and make it the active one. */
export const addNoteToTile =
  (tileId: string, _sessionId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<string | null> => {
    const key = `note:${tileId}`;
    if (inFlightTileOps.has(key)) return null;
    inFlightTileOps.add(key);
    try {
      const tile = getState().warRoom.tilesById[tileId];
      const note = await createNote({
        content: "",
        label: "War Room note",
        task_id: tile?.task_id ?? undefined,
      });
      dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
      await service.createTileNoteLink(tileId, note.id);
      dispatch(setTileLink({ id: tileId, noteId: note.id }));
      dispatch(noteLinkedToTile({ tileId, noteId: note.id }));
      return note.id;
    } catch {
      toast.error("Couldn't create the note");
      return null;
    } finally {
      inFlightTileOps.delete(key);
    }
  };

/** Switch which of a tile's notes is active (optimistic; persists pointer). */
export const setTileActiveNote =
  (tileId: string, noteId: string) =>
  async (dispatch: AppDispatch) => {
    dispatch(setActiveNote({ tileId, noteId }));
    dispatch(setTileLink({ id: tileId, noteId }));
    try {
      await service.setActiveTileNoteLink(tileId, noteId);
    } catch {
      toast.error("Couldn't switch the note");
    }
  };

/** Return the tile's active note, creating one if needed. */
export const ensureTileNote =
  (tileId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<string | null> => {
    const active = getState().warRoom.activeNoteByTile[tileId];
    if (active) return active;
    // A tile may already carry a backfilled note_id without a loaded link.
    const tile = getState().warRoom.tilesById[tileId];
    if (tile?.note_id) {
      dispatch(
        noteSessionsLoadedForTile({
          tileId,
          noteIds: [tile.note_id],
          activeId: tile.note_id,
        }),
      );
      return tile.note_id;
    }
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
    } catch {
      toast.error("Couldn't update pin");
      dispatch(setTilePinned({ id, pinned: !pinned }));
    }
  };

export const toggleTileHide =
  (id: string, hidden: boolean) => async (dispatch: AppDispatch) => {
    dispatch(setTileHidden({ id, hidden }));
    try {
      await service.updateTile(id, { is_hidden: hidden });
    } catch {
      toast.error("Couldn't update tile");
      dispatch(setTileHidden({ id, hidden: !hidden }));
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

/** Load a tile's attachment rows into the slice (Files tab mount). */
export const loadTileAttachments =
  (tileId: string) => async (dispatch: AppDispatch) => {
    try {
      const attachments = await service.listTileAttachments(tileId);
      dispatch(attachmentsLoadedForTile({ tileId, attachments }));
    } catch {
      /* non-fatal — the section just shows empty */
    }
  };

/** Link an existing/just-uploaded cloud file (cld_files.id) to a tile. */
export const attachFileToTile =
  (tileId: string, fileId: string, label?: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const attachment = await service.attachToTile(
        tileId,
        "user_file",
        fileId,
        label,
      );
      dispatch(attachmentUpserted({ tileId, attachment }));
      return true;
    } catch {
      toast.error("Couldn't attach the file");
      return false;
    }
  };

/** Link a document (udt_documents.id) to a tile. */
export const attachDocumentToTile =
  (tileId: string, documentId: string, label?: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const attachment = await service.attachToTile(
        tileId,
        "document",
        documentId,
        label,
      );
      dispatch(attachmentUpserted({ tileId, attachment }));
      return true;
    } catch {
      toast.error("Couldn't attach the document");
      return false;
    }
  };

/** Remove a tile's attachment link (the file/document itself is untouched). */
export const detachTileAttachment =
  (tileId: string, attachmentId: string) => async (dispatch: AppDispatch) => {
    // Optimistic — the link is cheap to re-create.
    dispatch(attachmentRemoved({ tileId, id: attachmentId }));
    try {
      await service.detachFromTile(attachmentId);
    } catch {
      toast.error("Couldn't remove the attachment");
      dispatch(loadTileAttachments(tileId));
    }
  };
