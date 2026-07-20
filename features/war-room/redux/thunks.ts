// features/war-room/redux/thunks.ts
//
// Async thunks bridging the warRoom slice and Supabase via service.ts.
// Optimistic where it helps; loud (toast) on failure.

import { toast } from "@/lib/toast";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
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
  fetchCleanedSegmentsThunk,
  fetchRawSegmentsThunk,
} from "@/features/transcript-studio/redux/thunks";
import {
  setActiveAssistantConversationThunk,
  switchAssistantAgentThunk,
} from "@/features/transcript-studio/redux/assistantAgent.thunk";
import {
  selectCleanedSegmentsLoaded,
  selectRawSegmentsLoaded,
} from "@/features/transcript-studio/redux/selectors";
import { associationsService } from "@/features/scopes/service/associationsService";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { setEntityScopes } from "@/features/scopes/redux/thunks/setEntityScopes";
import { isScopesRpcErr } from "@/features/scopes/types";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import {
  WAR_ROOM_AUDIO_SOURCE,
  WAR_ROOM_ROOM_AGENT_ID,
  WAR_ROOM_THREAD_AGENT_ID,
} from "../constants";
import { reportWarRoomError } from "../utils/reportWarRoomError";
import {
  selectActiveAudioSessionId,
  selectActiveNoteId,
  selectAssignmentsForContainer,
  selectAudioSessionIdsForThread,
  selectContainerAssignmentsLoaded,
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
  type WarRoomSession,
  type WarRoomSessionUpdate,
  type WarRoomThread,
  type WarRoomThreadUpdate,
} from "../types";
import {
  agentConversationsLoaded,
  assignmentActiveSet,
  assignmentRemoved,
  assignmentsLoadedBulk,
  assignmentsLoadedForContainer,
  assignmentUpserted,
  clearRoomThreads,
  orphanThreadsLoaded,
  pendingConversationCleared,
  pendingConversationSet,
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
import { normalizeThreadTab } from "../hooks/useThreadTabs";

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

/**
 * Map each thread's ACTIVE studio session → its assistant conversation id
 * (one batched read), then store per-thread for the sync context builder.
 * Best-effort — a failure just leaves sibling rows without `conversation=`.
 */
async function hydrateAgentConversations(
  dispatch: AppDispatch,
  contentAssignments: WarRoomAssignment[],
): Promise<void> {
  const sessionByThread = new Map<string, string>();
  for (const a of contentAssignments) {
    if (a.container_type !== "thread" || a.entity_type !== "studio_session") {
      continue;
    }
    if (a.is_active || !sessionByThread.has(a.container_id)) {
      sessionByThread.set(a.container_id, a.entity_id);
    }
  }
  if (sessionByThread.size === 0) return;
  const sessionIds = [...new Set(sessionByThread.values())];
  const { data, error } = await supabase
    .schema("transcripts")
    .from("studio_sessions")
    .select("id,assistant_conversation_id")
    .in("id", sessionIds);
  if (error) {
    reportWarRoomError("hydrateAgentConversations", error, { toast: false });
    return;
  }
  const convoBySession = new Map<string, string | null>(
    (data ?? []).map((r) => [r.id, r.assistant_conversation_id ?? null]),
  );
  const byThread: Record<string, string | null> = {};
  for (const [threadId, sessionId] of sessionByThread) {
    byThread[threadId] = convoBySession.get(sessionId) ?? null;
  }
  dispatch(agentConversationsLoaded(byThread));
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
      // The ONE moment the room's oversight chat is created (invariant 11's
      // room-level twin) — never auto-created after this.
      void dispatch(provisionRoomDefaults(session.id));
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

      // Resolve each thread's agent conversation id (the ACTIVE audio
      // session's assistant_conversation_id) so the SYNC Tier-1 context
      // builder can stamp sibling rows with `conversation=` — the handle for
      // cross-agent reads (war_room_read_thread). Fire-and-forget.
      void hydrateAgentConversations(dispatch, contentAssignments);

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
  async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      // `organization_id` is NOT NULL on `workspace.war_rooms` — never write
      // null/undefined (an empty UPDATE returns 0 rows → "Cannot coerce the
      // result to a single JSON object"). Only persist a real, changed org.
      const prior = getState().warRoom.sessionsById[sessionId];
      if (
        ctx.organizationId &&
        prior &&
        ctx.organizationId !== prior.organization_id
      ) {
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
  (input: CreateThreadInput, provisionOpts?: { noteContent?: string }) =>
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
      // The ONE moment a thread's note / audio session / chat conversation are
      // created — never auto-created again after this (fire-and-forget; a
      // partial failure surfaces as the tab's explicit-create empty state).
      void dispatch(
        provisionThreadDefaults(thread.id, input.roomId ?? null, provisionOpts),
      );
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
      void dispatch(provisionThreadDefaults(thread.id, session.id));
      void dispatch(provisionRoomDefaults(session.id));
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
  const taskId = selectThreadTaskId(threadId)(state);
  const taskTitle = taskId
    ? selectTaskById(state, taskId)?.title?.trim()
    : undefined;
  const ordinal = roomId
    ? (state.warRoom.threadIdsByRoom[roomId]?.indexOf(threadId) ?? -1)
    : -1;
  // Note label references the THREAD only — never the room it happens to
  // live in (a thread can move between rooms; the room name was also just
  // noise once you already know which thread the note tab belongs to).
  const base =
    thread?.title?.trim() ||
    taskTitle ||
    (ordinal >= 0 ? `Thread ${ordinal + 1}` : "Thread");
  const existing = selectNoteIdsForThread(threadId)(state).length;
  const n = existing + 1;
  return n > 1 ? `${base} (${n})` : base;
}

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
    created_by: t.created_by ?? null,
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
  (threadId: string, title?: string) =>
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
          title: title?.trim() || "Recording",
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

/**
 * Hydrate-ONLY resolver for a thread's audio session — NEVER creates one.
 * Sessions (like notes and conversations) are created exactly once at thread
 * provisioning, or by the user's explicit "+ New Session"; a thread genuinely
 * without one renders the explicit-create empty state instead.
 */
export const hydrateThreadAudio =
  (threadId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const key = `hydrate-audio:${threadId}`;
    if (inFlightThreadOps.has(key)) return null;
    inFlightThreadOps.add(key);
    try {
      if (!selectContainerAssignmentsLoaded("thread", threadId)(getState())) {
        await dispatch(loadThreadAttachments(threadId));
      }
      const active = selectActiveAudioSessionId(threadId)(getState());
      if (!active) return null;
      // Only pull raw segments if this session has never been fetched. In
      // gallery mode every tile mounts its audio tab and calls this; without
      // the guard a single "switch all tiles to audio" broadcast fired N
      // parallel fetchRawSegments. Gate on "loaded?" (key present) rather than
      // "count === 0" so a legitimately-empty session isn't re-fetched forever.
      if (!selectRawSegmentsLoaded(active)(getState())) {
        dispatch(fetchRawSegmentsThunk({ sessionId: active }));
      }
      return active;
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

/**
 * Hydrate the transcript content (raw + cleaned segments) of EVERY
 * `studio_session` assigned to a thread — not just the active one (D14
 * fence 2). The Tier-1 agent context emits a per-session transcript entry for
 * each of the thread's audio sessions; those selectors read the studio slice,
 * which only ever held the ACTIVE session's segments — so every other session
 * surfaced to the agent as missing. Hydrate-only, loaded-gated (never
 * re-fetches an already-loaded session), never creates anything.
 */
export const hydrateThreadTranscripts =
  (threadId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string[]> => {
    const key = `hydrate-transcripts:${threadId}`;
    if (inFlightThreadOps.has(key)) return [];
    inFlightThreadOps.add(key);
    try {
      if (!selectContainerAssignmentsLoaded("thread", threadId)(getState())) {
        await dispatch(loadThreadAttachments(threadId));
      }
      const sessionIds = selectAudioSessionIdsForThread(threadId)(getState());
      const jobs: Promise<unknown>[] = [];
      for (const sessionId of sessionIds) {
        if (!selectRawSegmentsLoaded(sessionId)(getState())) {
          jobs.push(dispatch(fetchRawSegmentsThunk({ sessionId })));
        }
        if (!selectCleanedSegmentsLoaded(sessionId)(getState())) {
          jobs.push(dispatch(fetchCleanedSegmentsThunk({ sessionId })));
        }
      }
      await Promise.all(jobs);
      return sessionIds;
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

export const addNoteToThread =
  (threadId: string, roomId: string, label?: string, content?: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const key = `note:${threadId}`;
    if (inFlightThreadOps.has(key)) return null;
    inFlightThreadOps.add(key);
    try {
      const note = await createNote({
        content: content ?? "",
        label:
          label?.trim() || deriveThreadNoteLabel(getState(), threadId, roomId),
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

/**
 * Hydrate a thread's assignment bucket if it hasn't loaded yet — NEVER
 * creates anything. The tabs call this on mount instead of the old ensure-*
 * thunks (which auto-created a note/session and were a duplicate factory).
 */
export const hydrateThreadAssignments =
  (threadId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    if (selectContainerAssignmentsLoaded("thread", threadId)(getState())) {
      return;
    }
    const key = `hydrate:${threadId}`;
    if (inFlightThreadOps.has(key)) return;
    inFlightThreadOps.add(key);
    try {
      await dispatch(loadThreadAttachments(threadId));
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

// ── Room (oversight) conversations — conversation → war_room edges ─────────
// The room agent's chat set mirrors the per-thread model exactly: created ONCE
// at war-room provisioning (or an explicit "+ New Chat"), bound from the
// durable edge, never auto-minted.

/**
 * Start a NEW oversight chat on a room with a picked agent — the ONLY way a
 * room conversation is ever created.
 *
 * Mints and holds it as the room's PENDING conversation; writes nothing
 * durable. The `conversation → war_room` edge is written by `useRoomAgent` the
 * moment the conversation materializes server-side, exactly as the thread path
 * does. Pre-writing the edge here is what left permanent phantom room chats
 * behind whenever a provisioned chat was never used.
 */
export const startRoomConversation =
  (roomId: string, agentId: string) =>
  async (dispatch: AppDispatch): Promise<string | null> => {
    try {
      const conversationId = await dispatch(
        createManualInstance({
          agentId,
          apiEndpointMode: "agent",
          sourceFeature: "agent-runner",
          allowChat: true,
          autoRun: false,
          displayMode: "chat-assistant",
        }),
      ).unwrap();
      dispatch(
        pendingConversationSet({
          key: containerKey("room", roomId),
          conversationId,
        }),
      );
      return conversationId;
    } catch (err) {
      reportWarRoomError("startRoomConversation", err, {
        toast: "Couldn't start the room chat",
      });
      return null;
    }
  };

/**
 * Promote a PENDING conversation to a durable edge, once it is known to exist
 * server-side. The single place a deferred conversation edge is written.
 *
 * Callers MUST have gated on materialization (`useConversationMaterialized` /
 * `waitForConversationPersisted`) — this thunk trusts that and does not re-check,
 * so it stays a plain write with no extra round trip. Idempotent:
 * `createAssignment` no-ops when the edge already matches, and the pending entry
 * is cleared only for this exact id.
 */
export const materializeConversationEdge =
  (
    ref: ContainerRef,
    conversationId: string,
    opts: AttachEntityOptions = {},
  ) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    const ok = await dispatch(
      attachEntityToContainer(ref, "conversation", conversationId, opts),
    );
    if (ok) {
      dispatch(
        pendingConversationCleared({
          key: containerKey(ref.type, ref.id),
          conversationId,
        }),
      );
    }
    return ok;
  };

/**
 * One-time room provisioning — the ONLY automatic creator of the room's
 * oversight conversation. Fired right after the war_room row is created.
 *
 * The provisioned chat is PENDING, not durable (see `startRoomConversation`).
 * If the user never sends a first turn and reloads, it is gone and the room
 * falls back to its explicit "Start chat" empty state. That is intentional:
 * re-provisioning on mount is precisely the refresh-mint bug invariant 11
 * exists to prevent, and a chat nobody used is not worth a permanent row.
 */
export const provisionRoomDefaults =
  (roomId: string) =>
  async (dispatch: AppDispatch): Promise<void> => {
    const key = `provision-room:${roomId}`;
    if (inFlightThreadOps.has(key)) return;
    inFlightThreadOps.add(key);
    try {
      await dispatch(
        startRoomConversation(roomId, WAR_ROOM_ROOM_AGENT_ID),
      );
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

/** Flip which oversight chat the room panel is bound to (edge is_active). */
export const setRoomActiveConversation =
  (roomId: string, conversationId: string) =>
  async (dispatch: AppDispatch) => {
    dispatch(
      assignmentActiveSet({
        key: containerKey("room", roomId),
        entityType: "conversation",
        entityId: conversationId,
      }),
    );
    try {
      await assoc.setActiveAssignment(
        roomRef(roomId),
        "conversation",
        conversationId,
      );
    } catch (err) {
      reportWarRoomError("setRoomActiveConversation", err, {
        toast: "Couldn't switch the room chat",
      });
    }
  };

/**
 * Unlink an oversight chat from a room (edge only, never the conversation
 * row). If it was active, focus flips to the first remaining.
 */
export const removeConversationFromRoom =
  (roomId: string, conversationId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const key = containerKey("room", roomId);
    const row = selectAssignmentsForContainer("room", roomId)(getState()).find(
      (a) => a.entity_type === "conversation" && a.entity_id === conversationId,
    );
    // A PENDING chat has no edge to remove — it exists only in Redux. Dropping
    // the placeholder IS the removal; without this the switcher's unlink is a
    // silent no-op on the one chat a user is most likely to discard.
    if (!row) {
      const pending = getState().warRoom.pendingConversationByContainer[key];
      if (pending === conversationId) {
        dispatch(pendingConversationCleared({ key, conversationId }));
        return true;
      }
      return false;
    }
    dispatch(assignmentRemoved({ key, id: row.id }));
    try {
      await assoc.removeAssignmentByEntity(
        roomRef(roomId),
        "conversation",
        conversationId,
      );
    } catch (err) {
      dispatch(assignmentUpserted({ key, assignment: row }));
      reportWarRoomError("removeConversationFromRoom", err, {
        toast: "Couldn't remove the chat",
      });
      return false;
    }
    if (row.is_active) {
      const remaining = selectAssignmentsForContainer(
        "room",
        roomId,
      )(getState()).find((a) => a.entity_type === "conversation");
      if (remaining) {
        void dispatch(setRoomActiveConversation(roomId, remaining.entity_id));
      }
    }
    return true;
  };

/** Hydrate a room's assignment bucket if needed — NEVER creates anything. */
export const hydrateRoomAssignments =
  (roomId: string) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    if (selectContainerAssignmentsLoaded("room", roomId)(getState())) return;
    const key = `hydrate-room:${roomId}`;
    if (inFlightThreadOps.has(key)) return;
    inFlightThreadOps.add(key);
    try {
      const rows = await assoc.listAssignmentsForContainer(roomRef(roomId));
      dispatch(
        assignmentsLoadedForContainer({
          key: containerKey("room", roomId),
          assignments: rows,
        }),
      );
    } catch (err) {
      reportWarRoomError("hydrateRoomAssignments", err, { toast: false });
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

/**
 * Grace period before an edge with no conversation row is judged phantom.
 *
 * Post-fix, an edge is only ever written AFTER the conversation is confirmed
 * real, so this should never mask anything. It exists purely so a read that
 * races a just-landed write (or a replica lagging the commit) can't delete a
 * healthy edge — the cleanup must never be able to destroy live data.
 *
 * Kept in step with the 15-minute floor in the `dangling-conversation-associations`
 * integrity check (lib/integrity/checks.ts) so the alarm and the sweeper never
 * disagree about what counts as debris.
 */
const PHANTOM_EDGE_GRACE_MS = 15 * 60 * 1000;

/**
 * Cleanup of PHANTOM conversation edges — an edge pointing at a conversation
 * that has no `chat.conversation` row and never will.
 *
 * These are debris from the era when a conversation edge was written at MINT
 * time: a client-minted id has no row until its first turn commits, so every
 * provisioned-but-never-used chat left an immortal ghost in the chat list. The
 * creation paths are fixed (edges are now written only after materialization —
 * see `materializeConversationEdge`), so this exists to sweep pre-existing
 * debris and to stay a loud tripwire if a creation path ever regresses.
 *
 * HISTORY — why this used to be a no-op: it skipped any edge carrying
 * `metadata.agentId`, on the theory that a stamp meant "post-fix, therefore
 * healthy". But EVERY creation path stamps `agentId`, so the filter excluded
 * 100% of its own targets and the cleanup never deleted anything. It also
 * protected ids referenced by the session pointer — but a phantom id is
 * precisely what a broken pointer names, so that protected the debris too.
 *
 * The rule now is the only one that is actually true: prune an edge when its
 * conversation does not exist AND the edge is older than the grace window AND
 * the caller wrote the edge. Nothing else can distinguish a ghost from a live
 * chat.
 *
 * TWO GUARDS, BOTH LOAD-BEARING — deleting a live chat must be impossible:
 *
 *  1. **Existence via `conversations_exist`, never a direct read.**
 *     `platform.associations` is readable AND deletable ORG-WIDE
 *     (`iam.has_org_access`), but `chat.conversation` SELECT is PER-ROW
 *     (`created_by = auth.uid() OR iam.has_access(...)`). A direct
 *     `select id from chat.conversation where id in (...)` therefore returns
 *     nothing both when a row is absent and when the caller merely can't read
 *     it — so a teammate opening your War Room would read your edges, fail to
 *     read your private chats, call them all phantom, and delete them. The
 *     SECURITY DEFINER RPC makes absence mean absence.
 *  2. **Own edges only.** Even with (1) correct, a user has no business
 *     deleting an edge someone else wrote. `created_by` is the backstop.
 *
 * Loud by design: every prune is a `console.error`. After the backfill, this
 * firing means a creation path regressed and is minting fresh debris.
 */
const phantomPrunedContainers = new Set<string>();
export const pruneContainerPhantomConversations =
  (ref: ContainerRef) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<number> => {
    const key = containerKey(ref.type, ref.id);
    if (phantomPrunedContainers.has(key)) return 0;
    phantomPrunedContainers.add(key);
    const userId = getState().userAuth?.id ?? null;
    // Without a known caller we cannot prove ownership — do nothing.
    if (!userId) return 0;
    const rows = selectAssignmentsForContainer(
      ref.type,
      ref.id,
    )(getState()).filter(
      (a) => a.entity_type === "conversation" && a.created_by === userId,
    );
    if (rows.length === 0) return 0;

    const ids = rows.map((r) => r.entity_id);
    const { data, error } = await supabase.rpc("conversations_exist", {
      p_ids: ids,
    });
    // A failed read is not evidence of absence — never prune on an unknown.
    if (error) {
      reportWarRoomError("pruneContainerPhantomConversations", error, {
        toast: false,
      });
      return 0;
    }
    const real = new Set(
      ((data as Array<{ id: string }> | null) ?? []).map((r) => String(r.id)),
    );

    const cutoff = Date.now() - PHANTOM_EDGE_GRACE_MS;
    let pruned = 0;
    for (const row of rows) {
      const id = row.entity_id;
      if (real.has(id)) continue;
      const createdAt = row.created_at ? Date.parse(row.created_at) : NaN;
      // Unparseable timestamp ⇒ treat as young and leave it alone.
      if (!Number.isFinite(createdAt) || createdAt > cutoff) continue;
      console.error(
        "[war-room] pruning phantom conversation edge (no server row)",
        { container: key, conversationId: id, createdAt: row.created_at },
      );
      const ok =
        ref.type === "thread"
          ? await dispatch(removeEntityFromThread(ref.id, "conversation", id))
          : await dispatch(removeConversationFromRoom(ref.id, id));
      if (ok !== false) pruned += 1;
    }
    return pruned;
  };

/** Thread-scoped convenience — the shape the Chat tab calls. */
export const pruneThreadPhantomConversations = (threadId: string) =>
  pruneContainerPhantomConversations(threadRef(threadId));

/**
 * Bind the thread's Chat tab to one of its attached conversations: flips the
 * `conversation → thread` edge's is_active AND switches the backing session's
 * assistant conversation (instance + history rehydrate ride along), so the
 * embedded Agent+ panel re-binds automatically.
 */
export const setThreadActiveConversation =
  (threadId: string, sessionId: string, conversationId: string) =>
  async (dispatch: AppDispatch) => {
    dispatch(
      assignmentActiveSet({
        key: containerKey("thread", threadId),
        entityType: "conversation",
        entityId: conversationId,
      }),
    );
    try {
      await dispatch(
        setActiveAssistantConversationThunk({ sessionId, conversationId }),
      ).unwrap();
      await assoc.setActiveAssignment(
        threadRef(threadId),
        "conversation",
        conversationId,
      );
    } catch (err) {
      reportWarRoomError("setThreadActiveConversation", err, {
        toast: "Couldn't switch the chat",
      });
    }
  };

/**
 * Start a NEW chat on a thread with a picked agent — the ONLY way a thread
 * conversation is ever created (called from thread provisioning and the Chat
 * toolbar's "+ New Chat"; the panel itself never mints — autoCreate:false).
 *
 * Mints a fresh conversation for the thread's session and binds it in REDUX
 * ONLY. It writes NOTHING durable — no association edge, no session pointer —
 * because a client-minted id has no `chat.conversation` row until its first
 * turn commits, and persisting it early leaves a dangling pointer that can
 * never self-heal (the phantom-chat class: a provisioned chat nobody used,
 * stuck in the chat list forever).
 *
 * Both durable writes are deferred to the moment the conversation becomes real:
 *   • the association edge — `ThreadAgentPanel`, gated on
 *     `useConversationMaterialized`;
 *   • the session pointer — `useStudioAssistant`, gated on the same
 *     server-confirmed request status.
 *
 * Consequence by design: a chat that is never sent into leaves no trace, and a
 * reload before the first turn returns the thread to its "Start chat" empty
 * state instead of resurrecting a ghost. Until the server auto-labels it,
 * surfaces show the agent's name as the chat label.
 */
export const startThreadConversation =
  (threadId: string, sessionId: string, agentId: string) =>
  async (dispatch: AppDispatch): Promise<string | null> => {
    try {
      const conversationId = await dispatch(
        switchAssistantAgentThunk({ sessionId, agentId, mode: "fresh" }),
      ).unwrap();
      if (!conversationId) return null;
      return conversationId;
    } catch (err) {
      reportWarRoomError("startThreadConversation", err, {
        toast: "Couldn't start the chat",
      });
      return null;
    }
  };

/**
 * Attach an EXISTING conversation (one the user already owns, picked from the
 * conversation picker) to a thread and bind it as the thread's active chat.
 *
 * Unlike `startThreadConversation` — which MINTS a brand-new conversation —
 * this links a conversation that already exists. The current title is stamped
 * as the edge `label` so the Resources surface and the Chat switcher show the
 * real name immediately (no re-read of `chat.conversation`, per the label-at-
 * attach-time contract). Idempotent: re-picking an already-attached chat just
 * re-focuses it. Binding the panel needs the tile's session, so `sessionId` is
 * required.
 */
export const attachExistingConversationToThread =
  (
    threadId: string,
    sessionId: string,
    conversationId: string,
    label?: string | null,
  ) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<boolean> => {
    const already = selectAssignmentsForContainer(
      "thread",
      threadId,
    )(getState()).some(
      (a) => a.entity_type === "conversation" && a.entity_id === conversationId,
    );
    if (!already) {
      const ok = await dispatch(
        attachEntityToThread(threadId, "conversation", conversationId, {
          label: label?.trim() || null,
          metadata: { role: "agent" },
        }),
      );
      if (!ok) return false;
    }
    await dispatch(
      setThreadActiveConversation(threadId, sessionId, conversationId),
    );
    return true;
  };

/**
 * One-time thread provisioning — the ONLY place a thread's note, audio
 * session, and chat conversation are created automatically. Runs right after
 * the thread row is created (createThread / ensureRoomForProject); nothing
 * else may auto-create these — every later create is an explicit user action
 * (the toolbars' "+ New …"). Fire-and-forget: a partial failure logs loudly
 * and the affected tab shows its explicit-create empty state instead.
 */
export const provisionThreadDefaults =
  (threadId: string, roomId: string | null, opts?: { noteContent?: string }) =>
  async (dispatch: AppDispatch): Promise<void> => {
    const key = `provision:${threadId}`;
    if (inFlightThreadOps.has(key)) return;
    inFlightThreadOps.add(key);
    try {
      await dispatch(
        addNoteToThread(threadId, roomId ?? "", undefined, opts?.noteContent),
      );
      const sessionId = await dispatch(addAudioSessionToThread(threadId));
      if (sessionId) {
        await dispatch(
          startThreadConversation(
            threadId,
            sessionId,
            WAR_ROOM_THREAD_AGENT_ID,
          ),
        );
      }
    } catch (err) {
      reportWarRoomError("provisionThreadDefaults", err, { toast: false });
    } finally {
      inFlightThreadOps.delete(key);
    }
  };

/**
 * Unlink an entity (note / studio_session / conversation / …) from a thread —
 * removes the association edge only, never the entity's own row. If the
 * removed entity was the thread's active one of its type, focus flips to the
 * first remaining (conversation re-binding is the caller's job — it needs the
 * session).
 */
export const removeEntityFromThread =
  (
    threadId: string,
    entityType: "note" | "studio_session" | "conversation",
    entityId: string,
  ) =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    const key = containerKey("thread", threadId);
    const bucketRows = selectAssignmentsForContainer(
      "thread",
      threadId,
    )(getState());
    const row = bucketRows.find(
      (a) => a.entity_type === entityType && a.entity_id === entityId,
    );
    if (!row) return false;
    dispatch(assignmentRemoved({ key, id: row.id }));
    try {
      await assoc.removeAssignmentByEntity(
        threadRef(threadId),
        entityType,
        entityId,
      );
    } catch (err) {
      // Put the row back — the server still has the edge.
      dispatch(assignmentUpserted({ key, assignment: row }));
      reportWarRoomError("removeEntityFromThread", err, {
        toast: "Couldn't remove it from this thread",
      });
      return false;
    }
    if (row.is_active) {
      const remaining = selectAssignmentsForContainer(
        "thread",
        threadId,
      )(getState()).find((a) => a.entity_type === entityType);
      if (remaining) {
        if (entityType === "note") {
          void dispatch(setThreadActiveNote(threadId, remaining.entity_id));
        } else if (entityType === "studio_session") {
          void dispatch(
            setThreadActiveAudioSession(threadId, remaining.entity_id),
          );
        } else {
          // Conversation: flip the edge pointer; the session re-bind (which
          // needs the sessionId) is done by the calling adapter.
          dispatch(
            assignmentActiveSet({
              key,
              entityType,
              entityId: remaining.entity_id,
            }),
          );
          void assoc
            .setActiveAssignment(
              threadRef(threadId),
              entityType,
              remaining.entity_id,
            )
            .catch((err) =>
              reportWarRoomError("removeEntityFromThread:reactivate", err, {
                toast: false,
              }),
            );
        }
      }
    }
    return true;
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

/** Hydrate one container's assignment bucket (thread or room). */
export const loadContainerAssignments =
  (ref: ContainerRef) => async (dispatch: AppDispatch) => {
    if (ref.type === "thread") {
      await dispatch(loadThreadAttachments(ref.id));
      return;
    }
    try {
      const rows = await assoc.listAssignmentsForContainer(ref);
      dispatch(
        assignmentsLoadedForContainer({
          key: containerKey(ref.type, ref.id),
          assignments: rows,
        }),
      );
    } catch (err) {
      reportWarRoomError("loadContainerAssignments", err, { toast: false });
    }
  };

export interface AttachEntityOptions {
  /** Human title stamped on the edge — pass it whenever the picker knows it. */
  label?: string | null;
  /** Single-active types: make this the focused member (default true). */
  makeActive?: boolean;
  /** Extra edge metadata (e.g. `{ canvas: true }`, `{ pinned: true }`). */
  metadata?: Json | null;
}

/**
 * THE attach path: link any registered entity to a thread or room. Open
 * vocabulary — the token guard lives in `associationsService`; single-active
 * demotion/position live in `assoc.createAssignment`. Replaces the deleted
 * per-type thunks (attachFileToThread / attachDocumentToThread / …), whose
 * closed vocabulary was the ceiling that hid every other entity type.
 */
export const attachEntityToContainer =
  (
    ref: ContainerRef,
    entityType: string,
    entityId: string,
    opts: AttachEntityOptions = {},
  ) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      const assignment = await assoc.createAssignment({
        ref,
        entityType,
        entityId,
        label: opts.label,
        makeActive: opts.makeActive,
        metadata: opts.metadata,
      });
      dispatch(
        assignmentUpserted({
          key: containerKey(ref.type, ref.id),
          assignment,
        }),
      );
      if (entityType === "task") {
        void dispatch(hydrateThreadTasks([entityId]));
      }
      return true;
    } catch (err) {
      reportWarRoomError("attachEntityToContainer", err, {
        toast: "Couldn't attach the resource",
      });
      return false;
    }
  };

/** Convenience: attach any registered entity to a thread. */
export const attachEntityToThread = (
  threadId: string,
  entityType: string,
  entityId: string,
  opts: AttachEntityOptions = {},
) => attachEntityToContainer(threadRef(threadId), entityType, entityId, opts);

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

/**
 * Bring an EXISTING thread (orphan or member of other rooms) into a room —
 * nothing but membership edges:
 *   - "move": every current `thread → war_room` membership is re-pointed at
 *     the target (single-home semantics).
 *   - "add":  a second membership edge is written; the thread now lives in
 *     BOTH rooms (multi-room membership is just another edge).
 * Hydrates the thread row + its content bucket so the tile renders
 * immediately in the target room. Idempotent when already a member.
 */
export const attachExistingThreadToRoom =
  (threadId: string, targetRoomId: string, mode: "move" | "add") =>
  async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<boolean> => {
    try {
      let thread: WarRoomThread | null =
        getState().warRoom.threadsById[threadId] ?? null;
      if (!thread) {
        thread = await service.getThread(threadId);
        if (!thread) {
          toast.error("That thread no longer exists");
          return false;
        }
        dispatch(threadUpserted(thread));
      }
      if (mode === "move") {
        // Truth from the DB, not the loaded-rooms cache — the thread may live
        // in a room this tab never opened.
        const currentRooms = (await assoc.listRoomIdsForThread(threadId)).filter(
          (r) => r !== targetRoomId,
        );
        for (const fromRoomId of currentRooms) {
          await assoc.moveThreadMembership(threadId, fromRoomId, targetRoomId);
          dispatch(
            threadMembershipChanged({
              threadId,
              fromRoomId,
              toRoomId: targetRoomId,
            }),
          );
        }
        if (currentRooms.length === 0) {
          await assoc.attachThreadToRoom(threadId, targetRoomId);
          dispatch(
            threadMembershipChanged({
              threadId,
              fromRoomId: null,
              toRoomId: targetRoomId,
            }),
          );
        }
      } else {
        await assoc.attachThreadToRoom(threadId, targetRoomId);
        dispatch(
          threadMembershipChanged({
            threadId,
            fromRoomId: null,
            toRoomId: targetRoomId,
          }),
        );
      }
      // Content bucket for the tile (notes/audio/chat/files) — idempotent.
      void dispatch(loadThreadAttachments(threadId));
      toast.success(
        mode === "move" ? "Thread moved to the room" : "Thread added to the room",
      );
      return true;
    } catch (err) {
      reportWarRoomError("attachExistingThreadToRoom", err, {
        toast:
          mode === "move"
            ? "Couldn't move the thread"
            : "Couldn't add the thread",
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
        activeTab: normalizeThreadTab(thread.active_tab),
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

/** Optimistically detach any resource from a container (thread or room). */
export const detachEntityFromContainer =
  (ref: ContainerRef, attachment: WarRoomAssignment) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    dispatch(
      assignmentRemoved({
        key: containerKey(ref.type, ref.id),
        id: attachment.id,
      }),
    );
    try {
      await assoc.removeAssignmentByEntity(
        ref,
        attachment.entity_type,
        attachment.entity_id,
      );
      return true;
    } catch (err) {
      if (ref.type === "thread") {
        dispatch(loadThreadAttachments(ref.id));
      } else {
        const rows = await assoc.listAssignmentsForContainer(ref);
        dispatch(
          assignmentsLoadedForContainer({
            key: containerKey(ref.type, ref.id),
            assignments: rows,
          }),
        );
      }
      reportWarRoomError("detachEntityFromContainer", err, {
        toast: "Couldn't remove the attachment",
      });
      return false;
    }
  };

export const detachThreadAttachment = (
  threadId: string,
  attachment: WarRoomAssignment,
) => detachEntityFromContainer(threadRef(threadId), attachment);

/** Map legacy flavor picker values to anchor fields on create. */
export { flavorToAnchor };
