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
import { selectRawSegmentCount } from "@/features/transcript-studio/redux/selectors";
import { associationsService } from "@/features/scopes/service/associationsService";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { setEntityScopes } from "@/features/scopes/redux/thunks/setEntityScopes";
import { isScopesRpcErr } from "@/features/scopes/types";
import { WAR_ROOM_AUDIO_SOURCE } from "../constants";
import { reportWarRoomError } from "../utils/reportWarRoomError";
import {
  selectActiveAudioSessionId,
  selectActiveNoteId,
  selectEffectiveThreadProjectId,
  selectNoteIdsForThread,
  selectRoomProjectId,
  selectThreadEffectiveContext,
  selectThreadTaskId,
} from "./selectors";
import {
  fetchThreadContentAssignmentsBulk,
  listThreadIdsForRoom,
} from "../service/readApi";
import * as service from "../service";
import * as assoc from "../service/associations";
import {
  containerKey,
  roomRef,
  threadRef,
  type ContainerRef,
  type CreateSessionInput,
  type CreateThreadInput,
  type ThreadAnchorType,
  type ThreadTab,
  type ThreadUserState,
  type WarRoomAssignment,
  type WarRoomAssignmentEntityType,
  type WarRoomSession,
  type WarRoomSessionUpdate,
  type WarRoomThread,
  type WarRoomThreadUpdate,
} from "../types";
import {
  assignmentActiveSet,
  assignmentRemoved,
  assignmentsLoadedBulk,
  assignmentsLoadedForContainer,
  assignmentUpserted,
  clearRoomThreads,
  orphanThreadsLoaded,
  sessionRemoved,
  sessionsLoaded,
  sessionUpserted,
  setActiveSession,
  setListError,
  setListStatus,
  setThreadActiveTab,
  setThreadUserState,
  setThreadUserStateBulk,
  setThreadsStatus,
  threadMembershipChanged,
  threadOrphaned,
  threadRemoved,
  threadUpserted,
  threadsLoadedForRoom,
} from "./slice";

// ── Helpers ───────────────────────────────────────────────────────────

function findRoomForThread(state: RootState, threadId: string): string | null {
  for (const [roomId, ids] of Object.entries(state.warRoom.threadIdsByRoom)) {
    if (ids.includes(threadId)) return roomId;
  }
  return null;
}

async function loadThreadUserStateBulk(
  dispatch: AppDispatch,
  threadIds: string[],
): Promise<void> {
  if (threadIds.length === 0) return;
  const res = await favoritesService.getBulk("thread", threadIds);
  if (isScopesRpcErr(res)) {
    reportWarRoomError("loadThreadUserStateBulk", res.error, { toast: false });
    return;
  }
  const bulk: Record<string, ThreadUserState> = {};
  for (const item of res.data.items) {
    bulk[item.entityId] = {
      isPinned: item.isPinned,
      isHidden: item.isHidden,
    };
  }
  dispatch(setThreadUserStateBulk(bulk));
}

/** Hydrate thread assignment buckets from `thread_contents()` — selectors unchanged. */
async function hydrateThreadAssignmentsFromRpc(
  dispatch: AppDispatch,
  threadIds: string[],
): Promise<WarRoomAssignment[]> {
  if (threadIds.length === 0) return [];
  const byContainer = await fetchThreadContentAssignmentsBulk(threadIds);
  dispatch(assignmentsLoadedBulk({ byContainer }));
  return Object.values(byContainer).flat();
}

function flavorToAnchor(
  flavor: "canvas" | "task" | "project",
  projectId?: string | null,
): Pick<WarRoomThreadUpdate, "anchor_type" | "anchor_id"> {
  if (flavor === "project" && projectId) {
    return { anchor_type: "project", anchor_id: projectId };
  }
  if (flavor === "task") {
    return { anchor_type: "task", anchor_id: null };
  }
  return { anchor_type: "canvas", anchor_id: null };
}

// ── Sessions ──────────────────────────────────────────────────────────

export const loadSessionsList = () => async (dispatch: AppDispatch) => {
  dispatch(setListStatus("loading"));
  try {
    const [sessions, allThreads] = await Promise.all([
      service.listSessions(),
      service.listAllUserThreads(),
    ]);
    dispatch(sessionsLoaded(sessions));

    const roomIds = sessions.map((s) => s.id);
    const assignedSet = await service.collectAssignedThreadIds(roomIds);
    const threadsById = new Map(allThreads.map((t) => [t.id, t]));

    const membership = await Promise.all(
      roomIds.map(async (roomId) => {
        const ids = await listThreadIdsForRoom(roomId);
        const threads = ids
          .map((id) => threadsById.get(id))
          .filter((t): t is WarRoomThread => !!t)
          .sort((a, b) => a.position - b.position);
        return { roomId, threads };
      }),
    );

    for (const t of allThreads) {
      dispatch(threadUpserted(t));
    }
    for (const { roomId, threads } of membership) {
      dispatch(threadsLoadedForRoom({ roomId, threads }));
    }

    const orphanIds = await service.listOrphanThreadIds(
      allThreads.map((t) => t.id),
      assignedSet,
    );
    dispatch(orphanThreadsLoaded(orphanIds));

    void loadThreadUserStateBulk(
      dispatch,
      allThreads.map((t) => t.id),
    );

    if (allThreads.length > 0) {
      try {
        const assignments = await hydrateThreadAssignmentsFromRpc(
          dispatch,
          allThreads.map((t) => t.id),
        );

        const taskIds = assignments
          .filter((a) => a.entity_type === "task")
          .map((a) => a.entity_id);
        if (taskIds.length > 0) {
          void dispatch(hydrateThreadTasks(taskIds));
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
      if (input.projectId) {
        const rows = await assoc.listAssignmentsForContainer(
          roomRef(session.id),
        );
        dispatch(
          assignmentsLoadedForContainer({
            key: containerKey("room", session.id),
            assignments: rows,
          }),
        );
      }
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

export const updateRoomIdentity =
  (id: string, patch: RoomIdentityPatch) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const prior = getState().warRoom.sessionsById[id];
    if (!prior) return false;

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
    if (Object.keys(next).length === 0) return true;

    dispatch(sessionUpserted({ ...prior, ...next }));
    try {
      const updated = await service.updateSession(id, next);
      dispatch(sessionUpserted(updated));
      return true;
    } catch (err) {
      dispatch(sessionUpserted(prior));
      reportWarRoomError("updateRoomIdentity", err, {
        toast: "Couldn't save the room details",
      });
      return false;
    }
  };

/** Persist the room's focused thread to `workspace.war_rooms.active_thread_id`. */
export const persistActiveThread =
  (roomId: string, threadId: string | null) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const session = getState().warRoom.sessionsById[roomId];
    if (!session) return;
    if ((session.active_thread_id ?? null) === (threadId ?? null)) return;
    try {
      const updated = await service.updateSession(roomId, {
        active_thread_id: threadId,
      });
      dispatch(sessionUpserted(updated));
    } catch (err) {
      reportWarRoomError("persistActiveThread", err, { toast: false });
    }
  };

export const deleteSession =
  (id: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    const prior = getState().warRoom.sessionsById[id];
    dispatch(sessionRemoved(id));
    try {
      await service.softDeleteSession(id);
      void assoc.purgeContainerEdges(roomRef(id)).catch((edgeErr) =>
        reportWarRoomError("deleteSession:purgeEdges", edgeErr, {
          toast: false,
        }),
      );
      toast.success("War Room deleted");
    } catch (err) {
      if (prior) dispatch(sessionUpserted(prior));
      else dispatch(loadSessionsList());
      reportWarRoomError("deleteSession", err, {
        toast: "Couldn't delete the War Room",
      });
    }
  };

export const loadWarRoomSession =
  (id: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(setActiveSession(id));
    dispatch(setThreadsStatus({ roomId: id, status: "loading" }));
    try {
      const existing = getState().warRoom.sessionsById[id];
      const [session, threads] = await Promise.all([
        existing ? Promise.resolve(existing) : service.getSession(id),
        service.listThreadsForRoom(id),
      ]);

      if (!session) {
        dispatch(setThreadsStatus({ roomId: id, status: "error" }));
        toast.error("War Room not found");
        return null;
      }

      dispatch(sessionUpserted(session));
      dispatch(threadsLoadedForRoom({ roomId: id, threads }));

      const threadIds = threads.map((t) => t.id);
      const [roomAssignments, contentAssignments] = await Promise.all([
        assoc.listAssignmentsForContainer(roomRef(id)),
        hydrateThreadAssignmentsFromRpc(dispatch, threadIds),
      ]);

      dispatch(
        assignmentsLoadedForContainer({
          key: containerKey("room", id),
          assignments: roomAssignments,
        }),
      );

      void loadThreadUserStateBulk(dispatch, threadIds);

      const taskIds = contentAssignments
        .filter((a) => a.entity_type === "task")
        .map((a) => a.entity_id);
      void dispatch(hydrateThreadTasks(taskIds));

      void service.touchSessionOpened(id);
      return session;
    } catch (err) {
      console.error("[war-room] loadWarRoomSession failed:", err);
      dispatch(setThreadsStatus({ roomId: id, status: "error" }));
      toast.error("Couldn't open the War Room");
      return null;
    }
  };

export const leaveWarRoomSession = (id: string) => (dispatch: AppDispatch) => {
  dispatch(clearRoomThreads(id));
  dispatch(setActiveSession(null));
};

// ── Context (scopes via setEntityScopes — not row columns) ─────────────

export interface ContextSelectionInput {
  organizationId: string | null;
  scopeIds: string[];
}

export const setSessionContextThunk =
  (sessionId: string, ctx: ContextSelectionInput) =>
  async (dispatch: AppDispatch) => {
    try {
      if (ctx.organizationId !== undefined) {
        const updated = await service.updateSession(sessionId, {
          organization_id: ctx.organizationId,
        });
        dispatch(sessionUpserted(updated));
      }
      const result = await dispatch(
        setEntityScopes({
          entityType: "war_room",
          entityId: sessionId,
          scopeIds: ctx.scopeIds,
          organizationId: ctx.organizationId ?? undefined,
        }),
      );
      if (!result.ok) {
        toast.error("Couldn't update the War Room context");
      }
    } catch {
      toast.error("Couldn't update the War Room context");
    }
  };

export const setThreadContextOverrideThunk =
  (threadId: string, ctx: ContextSelectionInput) =>
  async (dispatch: AppDispatch) => {
    try {
      const result = await dispatch(
        setEntityScopes({
          entityType: "thread",
          entityId: threadId,
          scopeIds: ctx.scopeIds,
          organizationId: ctx.organizationId ?? undefined,
        }),
      );
      if (!result.ok) {
        toast.error("Couldn't update the thread context");
      }
    } catch {
      toast.error("Couldn't update the thread context");
    }
  };

export const clearThreadContextOverrideThunk =
  (threadId: string) => async (dispatch: AppDispatch) => {
    try {
      const result = await dispatch(
        setEntityScopes({
          entityType: "thread",
          entityId: threadId,
          scopeIds: [],
        }),
      );
      if (!result.ok) {
        toast.error("Couldn't reset the thread context");
      }
    } catch {
      toast.error("Couldn't reset the thread context");
    }
  };

// ── Threads ───────────────────────────────────────────────────────────

export const createThread =
  (input: CreateThreadInput) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<WarRoomThread | null> => {
    try {
      const thread = await service.createThread(input);
      dispatch(threadUpserted(thread));
      if (input.roomId) {
        dispatch(
          threadMembershipChanged({
            threadId: thread.id,
            fromRoomId: null,
            toRoomId: input.roomId,
          }),
        );
      } else {
        const orphans = getState().warRoom.orphanThreadIds;
        if (!orphans.includes(thread.id)) {
          dispatch(orphanThreadsLoaded([...orphans, thread.id]));
        }
      }
      return thread;
    } catch {
      toast.error("Couldn't create the thread");
      return null;
    }
  };

export const setThreadProjectThunk =
  (threadId: string, projectId: string | null) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const thread = getState().warRoom.threadsById[threadId];
    if (!thread) return false;

    try {
      const patch: WarRoomThreadUpdate = {};
      if (projectId) {
        patch.anchor_type = "project";
        patch.anchor_id = projectId;
      } else if (thread.anchor_type === "project") {
        patch.anchor_type = "canvas";
        patch.anchor_id = null;
      }
      const updated = await service.updateThread(threadId, patch);
      dispatch(threadUpserted(updated));
      return true;
    } catch {
      toast.error("Couldn't update the thread's project");
      return false;
    }
  };

export const setThreadAnchorTypeThunk =
  (threadId: string, anchorType: ThreadAnchorType) =>
  async (dispatch: AppDispatch) => {
    try {
      const updated = await service.updateThread(threadId, {
        anchor_type: anchorType,
        anchor_id: anchorType === "canvas" ? null : undefined,
      });
      dispatch(threadUpserted(updated));
    } catch {
      toast.error("Couldn't change the thread type");
    }
  };

export const setRoomProjectThunk =
  (roomId: string, projectId: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      if (projectId) {
        const assignment = await assoc.createAssignment({
          ref: roomRef(roomId),
          entityType: "project",
          entityId: projectId,
          makeActive: true,
        });
        dispatch(
          assignmentUpserted({
            key: containerKey("room", roomId),
            assignment,
          }),
        );
      } else {
        const rows = await assoc.listAssignmentsForContainer(roomRef(roomId));
        const active = rows.find(
          (a) => a.entity_type === "project" && a.is_active,
        );
        if (active) {
          await assoc.removeAssignmentByEntity(
            roomRef(roomId),
            "project",
            active.entity_id,
          );
          dispatch(
            assignmentRemoved({
              key: containerKey("room", roomId),
              id: active.id,
            }),
          );
        }
      }
      return true;
    } catch {
      toast.error("Couldn't associate the room with the project");
      return false;
    }
  };

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
      const thread = await service.createThread({
        roomId: session.id,
        projectId,
        activeTab: "task",
        title: projectName?.trim() || null,
        position: 0,
      });
      dispatch(threadUpserted(thread));
      dispatch(
        threadsLoadedForRoom({
          roomId: session.id,
          threads: [thread],
        }),
      );
      return session;
    } catch {
      toast.error("Couldn't open a room for the project");
      return null;
    }
  };

const inFlightThreadOps = new Set<string>();

function deriveThreadNoteLabel(
  state: RootState,
  threadId: string,
  roomId: string | null,
): string {
  const thread = state.warRoom.threadsById[threadId];
  const roomName =
    (roomId && state.warRoom.sessionsById[roomId]?.title?.trim()) || "War Room";
  const taskId = selectThreadTaskId(threadId)(state);
  const taskTitle = taskId
    ? selectTaskById(state, taskId)?.title?.trim()
    : undefined;
  const ordinal = roomId
    ? (state.warRoom.threadIdsByRoom[roomId]?.indexOf(threadId) ?? -1)
    : -1;
  const threadLabel =
    thread?.title?.trim() ||
    taskTitle ||
    (ordinal >= 0 ? `Thread ${ordinal + 1}` : "Thread");
  const base =
    threadLabel === roomName ? roomName : `${roomName} — ${threadLabel}`;
  const existing = selectNoteIdsForThread(threadId)(state).length;
  const n = existing + 1;
  return n > 1 ? `${base} (${n})` : base;
}

export const createThreadNote =
  (threadId: string, roomId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const key = `note:${threadId}`;
    const thread = getState().warRoom.threadsById[threadId];
    const existingNote = selectActiveNoteId(threadId)(getState());
    if (!thread || existingNote) return existingNote;
    if (inFlightThreadOps.has(key)) return null;
    inFlightThreadOps.add(key);
    try {
      const note = await createNote({
        content: "",
        label: deriveThreadNoteLabel(getState(), threadId, roomId),
        task_id: selectThreadTaskId(threadId)(getState()) ?? undefined,
      });
      dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
      const assignment = await assoc.createAssignment({
        ref: threadRef(threadId),
        entityType: "note",
        entityId: note.id,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      return note.id;
    } catch (err) {
      reportWarRoomError("createThreadNote", err, {
        toast: "Couldn't create the note",
      });
      return null;
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

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

export const createThreadTask =
  (threadId: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const key = `task:${threadId}`;
    const thread = getState().warRoom.threadsById[threadId];
    const existingTask = selectThreadTaskId(threadId)(getState());
    if (!thread || existingTask) return existingTask;
    if (inFlightThreadOps.has(key)) return null;
    inFlightThreadOps.add(key);
    try {
      const roomId = findRoomForThread(getState(), threadId);
      const ctx = selectThreadEffectiveContext(threadId, roomId)(getState());
      const projectId = selectEffectiveThreadProjectId(
        threadId,
        roomId,
      )(getState());
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
        ref: threadRef(threadId),
        entityType: "task",
        entityId: taskId,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment: taskAssignment,
        }),
      );
      if (thread.anchor_type === "task" && !thread.anchor_id) {
        const updated = await service.updateThread(threadId, {
          anchor_id: taskId,
        });
        dispatch(threadUpserted(updated));
      }
      const noteIds = selectNoteIdsForThread(threadId)(getState());
      await Promise.all(
        noteIds.map((noteId) =>
          updateNoteApi(noteId, { task_id: taskId }).catch((err) =>
            reportWarRoomError("createThreadTask", err, {
              toast: "Created the task, but couldn't link a note to it",
            }),
          ),
        ),
      );
      return taskId;
    } catch (err) {
      reportWarRoomError("createThreadTask", err, {
        toast: "Couldn't create the task",
      });
      return null;
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

export const loadThreadSubtasks =
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

export const hydrateThreadTasks =
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

export const addAudioSessionToThread =
  (threadId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const key = `audio:${threadId}`;
    if (inFlightThreadOps.has(key)) return null;
    inFlightThreadOps.add(key);
    try {
      const userId = requireUserId();
      const roomId = findRoomForThread(getState(), threadId);
      const ctx = selectThreadEffectiveContext(threadId, roomId)(getState());
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
        ref: threadRef(threadId),
        entityType: "studio_session",
        entityId: session.id,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      return session.id;
    } catch (err) {
      reportWarRoomError("addAudioSessionToThread", err, {
        toast: "Couldn't start an audio session",
      });
      return null;
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

export const setThreadActiveAudioSession =
  (threadId: string, studioSessionId: string) =>
  async (dispatch: AppDispatch) => {
    dispatch(
      assignmentActiveSet({
        key: containerKey("thread", threadId),
        entityType: "studio_session",
        entityId: studioSessionId,
      }),
    );
    dispatch(fetchRawSegmentsThunk({ sessionId: studioSessionId }));
    try {
      await assoc.setActiveAssignment(
        threadRef(threadId),
        "studio_session",
        studioSessionId,
      );
    } catch (err) {
      reportWarRoomError("setThreadActiveAudioSession", err, {
        toast: "Couldn't switch the audio session",
      });
    }
  };

export const ensureThreadAudioSession =
  (threadId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const active = selectActiveAudioSessionId(threadId)(getState());
    if (active) {
      // Only pull raw segments if we haven't already loaded them for this
      // session. In gallery mode every tile mounts its audio tab and calls
      // this; without the guard a single "switch all tiles to audio" broadcast
      // fired N parallel fetchRawSegments for sessions already in Redux.
      if (selectRawSegmentCount(active)(getState()) === 0) {
        dispatch(fetchRawSegmentsThunk({ sessionId: active }));
      }
      return active;
    }
    return dispatch(addAudioSessionToThread(threadId));
  };

export const addNoteToThread =
  (threadId: string, roomId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const key = `note:${threadId}`;
    if (inFlightThreadOps.has(key)) return null;
    inFlightThreadOps.add(key);
    try {
      const note = await createNote({
        content: "",
        label: deriveThreadNoteLabel(getState(), threadId, roomId),
        task_id: selectThreadTaskId(threadId)(getState()) ?? undefined,
      });
      dispatch(upsertNoteFromServer({ note, fetchStatus: "full" }));
      const assignment = await assoc.createAssignment({
        ref: threadRef(threadId),
        entityType: "note",
        entityId: note.id,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      return note.id;
    } catch (err) {
      reportWarRoomError("addNoteToThread", err, {
        toast: "Couldn't create the note",
      });
      return null;
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

export const setThreadActiveNote =
  (threadId: string, noteId: string) => async (dispatch: AppDispatch) => {
    dispatch(
      assignmentActiveSet({
        key: containerKey("thread", threadId),
        entityType: "note",
        entityId: noteId,
      }),
    );
    try {
      await assoc.setActiveAssignment(threadRef(threadId), "note", noteId);
    } catch (err) {
      reportWarRoomError("setThreadActiveNote", err, {
        toast: "Couldn't switch the note",
      });
    }
  };

export const ensureThreadNote =
  (threadId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const active = selectActiveNoteId(threadId)(getState());
    if (active) return active;
    const roomId = findRoomForThread(getState(), threadId);
    return dispatch(addNoteToThread(threadId, roomId ?? ""));
  };

export const deleteThread =
  (id: string, roomId: string) => async (dispatch: AppDispatch) => {
    dispatch(threadRemoved({ id, roomId }));
    try {
      await service.softDeleteThread(id);
      void assoc.purgeContainerEdges(threadRef(id)).catch((edgeErr) =>
        reportWarRoomError("deleteThread:purgeEdges", edgeErr, {
          toast: false,
        }),
      );
    } catch {
      toast.error("Couldn't remove the thread");
    }
  };

export const setThreadActiveTabPersisted =
  (id: string, tab: ThreadTab) => async (dispatch: AppDispatch) => {
    dispatch(setThreadActiveTab({ id, tab }));
    try {
      await service.updateThread(id, { active_tab: tab });
    } catch {
      /* soft preference */
    }
  };

export const renameThread =
  (id: string, title: string) => async (dispatch: AppDispatch) => {
    const trimmed = title.trim();
    try {
      const updated = await service.updateThread(id, {
        title: trimmed || null,
      });
      dispatch(threadUpserted(updated));
    } catch {
      toast.error("Couldn't rename the thread");
    }
  };

export const toggleThreadPin =
  (id: string, pinned: boolean) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const prior = getState().warRoom.threadUserStateById[id] ?? {
      isPinned: false,
      isHidden: false,
    };
    dispatch(setThreadUserState({ id, state: { ...prior, isPinned: pinned } }));
    const res = await favoritesService.setPinned("thread", id, pinned);
    if (isScopesRpcErr(res)) {
      dispatch(setThreadUserState({ id, state: prior }));
      reportWarRoomError("toggleThreadPin", res.error, {
        toast: "Couldn't update pin",
      });
    }
  };

export const toggleThreadHide =
  (id: string, hidden: boolean) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const prior = getState().warRoom.threadUserStateById[id] ?? {
      isPinned: false,
      isHidden: false,
    };
    dispatch(setThreadUserState({ id, state: { ...prior, isHidden: hidden } }));
    const res = await favoritesService.setHidden("thread", id, hidden);
    if (isScopesRpcErr(res)) {
      dispatch(setThreadUserState({ id, state: prior }));
      reportWarRoomError("toggleThreadHide", res.error, {
        toast: "Couldn't update thread",
      });
    }
  };

export const persistThreadPositions =
  (updates: { id: string; position: number }[]) =>
  async (_dispatch: AppDispatch) => {
    try {
      await service.persistThreadPositions(updates);
    } catch {
      toast.error("Couldn't save thread order");
    }
  };

export const loadThreadAttachments =
  (threadId: string) => async (dispatch: AppDispatch) => {
    try {
      await hydrateThreadAssignmentsFromRpc(dispatch, [threadId]);
    } catch (err) {
      reportWarRoomError("loadThreadAttachments", err, { toast: false });
    }
  };

export const attachFileToThread =
  (threadId: string, fileId: string, label?: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(threadId),
        entityType: "user_file",
        entityId: fileId,
        label,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      return true;
    } catch (err) {
      reportWarRoomError("attachFileToThread", err, {
        toast: "Couldn't attach the file",
      });
      return false;
    }
  };

export const attachDocumentToThread =
  (threadId: string, documentId: string, label?: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(threadId),
        entityType: "document",
        entityId: documentId,
        label,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      return true;
    } catch (err) {
      reportWarRoomError("attachDocumentToThread", err, {
        toast: "Couldn't attach the document",
      });
      return false;
    }
  };

export const attachConversationToThread =
  (threadId: string, conversationId: string, label?: string | null) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(threadId),
        entityType: "conversation",
        entityId: conversationId,
        label,
        makeActive: true,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      return true;
    } catch (err) {
      reportWarRoomError("attachConversationToThread", err, { toast: false });
      return false;
    }
  };

export const attachExistingNoteToThread =
  (threadId: string, noteId: string) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(threadId),
        entityType: "note",
        entityId: noteId,
        makeActive: true,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      return true;
    } catch (err) {
      reportWarRoomError("attachExistingNoteToThread", err, {
        toast: "Couldn't attach the note",
      });
      return false;
    }
  };

export const attachExistingTaskToThread =
  (threadId: string, taskId: string) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(threadId),
        entityType: "task",
        entityId: taskId,
        makeActive: true,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      void dispatch(hydrateThreadTasks([taskId]));
      return true;
    } catch (err) {
      reportWarRoomError("attachExistingTaskToThread", err, {
        toast: "Couldn't attach the task",
      });
      return false;
    }
  };

/** Link a resource to a canvas thread's launcher (metadata.canvas, non-active). */
export const attachCanvasResourceToThread =
  (
    threadId: string,
    entityType: WarRoomAssignmentEntityType,
    entityId: string,
  ) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref: threadRef(threadId),
        entityType,
        entityId,
        makeActive: false,
        metadata: { canvas: true },
      });
      dispatch(
        assignmentUpserted({
          key: containerKey("thread", threadId),
          assignment,
        }),
      );
      if (entityType === "task") {
        void dispatch(hydrateThreadTasks([entityId]));
      }
      return true;
    } catch (err) {
      reportWarRoomError("attachCanvasResourceToThread", err, {
        toast: "Couldn't add the resource",
      });
      return false;
    }
  };

/** Create a task and pin it on a canvas thread (does not change anchor_type). */
export const createCanvasThreadTask =
  (threadId: string, title: string) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const thread = getState().warRoom.threadsById[threadId];
    if (!thread || thread.anchor_type !== "canvas") return null;
    const trimmed = title.trim();
    if (!trimmed) return null;
    try {
      const roomId = findRoomForThread(getState(), threadId);
      const ctx = selectThreadEffectiveContext(threadId, roomId)(getState());
      const projectId = selectEffectiveThreadProjectId(
        threadId,
        roomId,
      )(getState());
      const taskId = await dispatch(
        createTaskThunk({
          title: trimmed,
          organizationId: ctx.organizationId,
          scopeIds: ctx.scopeIds,
          projectId,
        }),
      ).unwrap();
      if (!taskId) return null;
      await dispatch(attachCanvasResourceToThread(threadId, "task", taskId));
      return taskId;
    } catch (err) {
      reportWarRoomError("createCanvasThreadTask", err, {
        toast: "Couldn't create the task",
      });
      return null;
    }
  };

export const moveThreadToRoom =
  (threadId: string, targetRoomId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    if (!getState().warRoom.threadsById[threadId]) return false;
    const fromRoomId = findRoomForThread(getState(), threadId);
    if (fromRoomId === targetRoomId) return true;
    try {
      await assoc.moveThreadMembership(threadId, fromRoomId, targetRoomId);
      dispatch(
        threadMembershipChanged({
          threadId,
          fromRoomId,
          toRoomId: targetRoomId,
        }),
      );
      toast.success("Thread moved");
      return true;
    } catch (err) {
      reportWarRoomError("moveThreadToRoom", err, {
        toast: "Couldn't move the thread",
      });
      return false;
    }
  };

/** Attach an orphan thread (no room edge) to an existing War Room. */
export const attachOrphanThreadToRoom =
  (threadId: string, targetRoomId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    if (!getState().warRoom.threadsById[threadId]) return false;
    const existingRoom = findRoomForThread(getState(), threadId);
    if (existingRoom) {
      return dispatch(moveThreadToRoom(threadId, targetRoomId));
    }
    try {
      await assoc.attachThreadToRoom(threadId, targetRoomId);
      dispatch(
        threadMembershipChanged({
          threadId,
          fromRoomId: null,
          toRoomId: targetRoomId,
        }),
      );
      toast.success("Thread attached");
      return true;
    } catch (err) {
      reportWarRoomError("attachOrphanThreadToRoom", err, {
        toast: "Couldn't attach the thread",
      });
      return false;
    }
  };

/** Create a new War Room and attach an orphan thread for full interaction. */
export const openOrphanThreadInNewRoom =
  (threadId: string) =>
  async (dispatch: AppDispatch): Promise<string | null> => {
    const session = await dispatch(createWarRoomSession());
    if (!session) return null;
    const ok = await dispatch(attachOrphanThreadToRoom(threadId, session.id));
    return ok ? session.id : null;
  };

export const removeThreadFromRoom =
  (threadId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    if (!getState().warRoom.threadsById[threadId]) return false;
    const fromRoomId = findRoomForThread(getState(), threadId);
    if (!fromRoomId) return true;
    try {
      const removed = await associationsService.remove({
        sourceType: "thread",
        sourceId: threadId,
        targetType: "war_room",
        targetId: fromRoomId,
      });
      if (isScopesRpcErr(removed)) throw removed.error;
      dispatch(threadOrphaned({ threadId, fromRoomId }));
      toast.success("Thread removed from room");
      return true;
    } catch (err) {
      reportWarRoomError("removeThreadFromRoom", err, {
        toast: "Couldn't remove the thread from its room",
      });
      return false;
    }
  };

export const importThreadToRoom =
  (threadId: string, targetRoomId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const thread = getState().warRoom.threadsById[threadId];
    if (!thread) return null;
    try {
      const position =
        getState().warRoom.threadIdsByRoom[targetRoomId]?.length ?? 0;
      const newThread = await service.createThread({
        roomId: targetRoomId,
        title: thread.title,
        anchorType: (thread.anchor_type as ThreadAnchorType) ?? "canvas",
        anchorId: thread.anchor_id,
        activeTab: (thread.active_tab as ThreadTab) ?? "task",
        position,
      });
      dispatch(threadUpserted(newThread));
      dispatch(
        threadMembershipChanged({
          threadId: newThread.id,
          fromRoomId: null,
          toRoomId: targetRoomId,
        }),
      );
      const copied = await assoc.copyContainerAssignments(
        threadRef(threadId),
        threadRef(newThread.id),
      );
      dispatch(
        assignmentsLoadedForContainer({
          key: containerKey("thread", newThread.id),
          assignments: copied,
        }),
      );
      toast.success("Thread imported");
      return newThread.id;
    } catch (err) {
      reportWarRoomError("importThreadToRoom", err, {
        toast: "Couldn't import the thread",
      });
      return null;
    }
  };

export const detachThreadAttachment =
  (threadId: string, attachment: WarRoomAssignment) =>
  async (dispatch: AppDispatch) => {
    dispatch(
      assignmentRemoved({
        key: containerKey("thread", threadId),
        id: attachment.id,
      }),
    );
    try {
      await assoc.removeAssignmentByEntity(
        threadRef(threadId),
        attachment.entity_type as WarRoomAssignmentEntityType,
        attachment.entity_id,
      );
    } catch (err) {
      dispatch(loadThreadAttachments(threadId));
      reportWarRoomError("detachThreadAttachment", err, {
        toast: "Couldn't remove the attachment",
      });
    }
  };

/** Map legacy flavor picker values to anchor fields on create. */
export { flavorToAnchor };
