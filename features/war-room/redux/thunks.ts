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
import { rawSegmentsAppended } from "@/features/transcript-studio/redux/slice";
import { insertRawSegment } from "@/features/transcript-studio/service/studioService";
import { selectRawSegments } from "@/features/transcript-studio/redux/selectors";
import { WAR_ROOM_AUDIO_SOURCE } from "../constants";
import { selectTileEffectiveContext } from "./selectors";
import * as service from "../service";
import type {
  CreateSessionInput,
  CreateTileInput,
  TileTab,
  WarRoomSession,
  WarRoomTile,
} from "../types";
import {
  audioSessionLinkedToTile,
  audioSessionsLoadedForTile,
  clearSessionTiles,
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
  setTileSaveState,
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
      await service.updateTile(tileId, { note_id: note.id });
      dispatch(setTileLink({ id: tileId, noteId: note.id }));
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
      // — honors the War Room invariant (carries its own context).
      const ctx = selectTileEffectiveContext(tileId)(getState());
      const taskId = await dispatch(
        createTaskThunk({
          title: "New task",
          organizationId: ctx.organizationId,
          scopeIds: ctx.scopeIds,
        }),
      ).unwrap();
      if (!taskId) return null;
      await service.updateTile(tileId, { task_id: taskId });
      dispatch(setTileLink({ id: tileId, taskId }));
      // Keep the tile's notepad associated with the task (best effort).
      if (tile.note_id)
        updateNoteApi(tile.note_id, { task_id: taskId }).catch(() => {});
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

/** Persist a finished transcript as a raw segment on the studio session. */
export const saveTileTranscript =
  (sessionId: string, text: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const existing = selectRawSegments(sessionId)(getState());
      const seg = await insertRawSegment({
        sessionId,
        recordingSegmentId: null,
        chunkIndex: existing.length,
        tStart: 0,
        tEnd: 0,
        text: trimmed,
        source: "manual",
      });
      dispatch(rawSegmentsAppended({ sessionId, segments: [seg] }));
    } catch {
      toast.error("Couldn't save the transcript");
    }
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

export { setTileSaveState };
