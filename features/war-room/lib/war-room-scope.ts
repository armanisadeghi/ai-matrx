/**
 * features/war-room/lib/war-room-scope.ts
 *
 * Runtime scope builders for the two War Room surfaces:
 *   - `matrx-user/war-room`        → `buildWarRoomRoomScope`  (the cockpit)
 *   - `matrx-user/war-room-thread` → `buildWarRoomThreadScope` (one tile)
 *
 * These are the SURFACE emitters (what agent bindings map against). They are a
 * different thing from `service/warRoomAgentContext.ts` / `roomAgentContext.ts`,
 * which build the inline `<war_room>` context BLOCK the room/thread agents read
 * as prose. Both read the same hydrated Redux state, so they can never disagree
 * about what is in the room — but the surface scope is a flat, named,
 * bindable value bag, per the manifests.
 *
 * Pure functions over `RootState` + the caller's live view state. Callers invoke
 * them at TRIGGER time (inside `getScope`), never on render, so what the agent
 * receives is what is on screen at the moment the user hits Run.
 */

import type { RootState } from "@/lib/redux/store";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  createWarRoomScope,
  type WarRoomResourceEntry,
  type WarRoomThreadRosterEntry,
} from "@/features/surfaces/manifests/war-room.manifest";
import {
  createWarRoomThreadScope,
  type WarRoomSiblingThreadEntry,
  type WarRoomThreadResourceEntry,
} from "@/features/surfaces/manifests/war-room-thread.manifest";
import { selectTaskById, selectSubtasksByParent } from "@/features/agent-context/redux/tasksSlice";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { selectScopeSelectionsContext } from "@/lib/redux/slices/appContextSlice";
import {
  selectActiveAudioSessionId,
  selectActiveConversationId,
  selectActiveNoteId,
  selectAttachmentsForThread,
  selectAudioSessionIdsForThread,
  selectContentAssignmentsForRoom,
  selectContentAssignmentsForThread,
  selectEffectiveThreadProjectId,
  selectHiddenThreads,
  selectOrderedGalleryThreadIds,
  selectPinnedThreadCount,
  selectRoomProjectId,
  selectRoomProjectMode,
  selectSessionById,
  selectThreadById,
  selectThreadIdsForRoom,
  selectThreadIsPinned,
  selectThreadTaskId,
} from "@/features/war-room/redux/selectors";
import { entityToSource } from "@/features/war-room/service/associations";
import { normalizeThreadTab } from "@/features/war-room/hooks/useThreadTabs";
import type { WarRoomAssignment } from "@/features/war-room/types";

// ── Shared helpers ─────────────────────────────────────────────────────────

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPinnedEdge(a: WarRoomAssignment): boolean {
  return isPlainObj(a.metadata) && a.metadata.pinned === true;
}

/** One association row → the flat `{ token, id, title, pinned }` surface shape. */
function toResourceEntry(a: WarRoomAssignment): WarRoomResourceEntry {
  const token = entityToSource(a.entity_type);
  return {
    token,
    id: a.entity_id,
    title: a.label?.trim() || `Untitled ${token}`,
    pinned: isPinnedEdge(a),
  };
}

function countByToken(
  rows: WarRoomAssignment[],
): Array<{ token: string; count: number }> {
  const counts = new Map<string, number>();
  for (const a of rows) {
    const token = entityToSource(a.entity_type);
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].map(([token, count]) => ({ token, count }));
}

/** A readable thread label — its own title, else its task's, else positional. */
function threadLabel(
  state: RootState,
  threadId: string,
  index: number,
): string {
  const thread = selectThreadById(threadId)(state);
  const own = thread?.title?.trim();
  if (own) return own;
  const taskId = selectThreadTaskId(threadId)(state);
  const taskTitle = taskId ? selectTaskById(state, taskId)?.title?.trim() : "";
  if (taskTitle) return taskTitle;
  return `Thread ${index + 1}`;
}

/** The globally-active scope selections (the header context chip). */
function activeScopeIds(state: RootState): string[] {
  return Object.values(selectScopeSelectionsContext(state)).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

// ── Room surface (`matrx-user/war-room`) ───────────────────────────────────

export interface WarRoomRoomViewState {
  /** Stage vs Grid — the cockpit mode (roomViewContext). */
  mode: string;
  /** The instrument projector's forced tab, or null. */
  projectedTab: string | null;
  /** The density dial. */
  density: string;
  /** The thread currently on the Stage, resolved against visible threads. */
  stagedThreadId: string | null;
}

export function buildWarRoomRoomScope(
  state: RootState,
  roomId: string,
  view: WarRoomRoomViewState,
): SurfaceScopePayload {
  const room = selectSessionById(roomId)(state);
  const allThreadIds = selectThreadIdsForRoom(roomId)(state);
  const visibleThreadIds = selectOrderedGalleryThreadIds(roomId)(state);
  const parkedThreadIds = selectHiddenThreads(roomId)(state).map((t) => t.id);
  const parkedSet = new Set(parkedThreadIds);

  const projectId = selectRoomProjectId(roomId)(state);
  const projectName = projectId
    ? selectProjectById(state, projectId)?.name
    : undefined;

  // Roster order = the cockpit's order (visible, pinned-first) then parked.
  const orderedIds = [
    ...visibleThreadIds,
    ...allThreadIds.filter((id) => parkedSet.has(id)),
  ];

  const threads: WarRoomThreadRosterEntry[] = orderedIds.map((id, index) => {
    const thread = selectThreadById(id)(state);
    const taskId = selectThreadTaskId(id)(state);
    const task = taskId ? selectTaskById(state, taskId) : undefined;
    const rows = selectContentAssignmentsForThread(id)(state);
    return {
      id,
      title: threadLabel(state, id, index),
      anchor: {
        type: thread?.anchor_type ?? "canvas",
        id: thread?.anchor_id ?? null,
      },
      task_id: taskId,
      ...(task?.title ? { task_title: task.title } : {}),
      active_tab: normalizeThreadTab(thread?.active_tab ?? null),
      position: thread?.position ?? index,
      pinned: selectThreadIsPinned(id)(state),
      parked: parkedSet.has(id),
      has_audio: selectAudioSessionIdsForThread(id)(state).length > 0,
      conversation_id: state.warRoom.agentConversationByThread[id] ?? null,
      resource_counts: countByToken(rows),
    };
  });

  const stagedId =
    view.stagedThreadId ?? room?.active_thread_id ?? visibleThreadIds[0] ?? null;
  const stagedTitle = stagedId
    ? threads.find((t) => t.id === stagedId)?.title
    : undefined;

  const roomRows = selectContentAssignmentsForRoom(roomId)(state);
  const scopeIds = activeScopeIds(state);

  return createWarRoomScope({
    room_id: roomId,
    room_name: room?.title?.trim() || "Untitled War Room",
    room_anchor: {
      type: room?.anchor_type ?? "canvas",
      id: room?.anchor_id ?? null,
    },
    room_project_mode: selectRoomProjectMode(roomId)(state),
    room_organization_id: room?.organization_id ?? "",
    thread_count: allThreadIds.length,
    threads,
    visible_thread_ids: [...visibleThreadIds],
    parked_thread_ids: parkedThreadIds,
    pinned_thread_count: selectPinnedThreadCount(roomId)(state),
    room_resources: roomRows.map(toResourceEntry),
    room_resource_counts: countByToken(roomRows),
    view_mode: view.mode,
    density: view.density,
    // Room-level recording ownership: `warRoom.audioRecording` is the single
    // in-flight recording for the mounted room (RoomRecordingController owns it).
    is_recording: state.warRoom.audioRecording != null,

    room_description: room?.description?.trim() || undefined,
    room_identity:
      room?.icon || room?.color
        ? {
            ...(room.icon ? { icon: room.icon } : {}),
            ...(room.color ? { color: room.color } : {}),
          }
        : undefined,
    room_project_id: projectId ?? undefined,
    room_project_name: projectName ?? undefined,
    active_thread_id: stagedId ?? undefined,
    active_thread_title: stagedTitle || undefined,
    projected_tab: view.projectedTab ?? undefined,
    active_scope_ids: scopeIds.length > 0 ? scopeIds : undefined,
  });
}

// ── Thread surface (`matrx-user/war-room-thread`) ──────────────────────────

export interface WarRoomThreadScopeExtras {
  /** The assistant agent bound to the tile's agent panel, when resolved. */
  assistantAgentId?: string | null;
}

export function buildWarRoomThreadScope(
  state: RootState,
  threadId: string,
  extras: WarRoomThreadScopeExtras = {},
): SurfaceScopePayload {
  const thread = selectThreadById(threadId)(state);
  const roomId = state.warRoom.activeSessionId ?? null;
  const room = roomId ? selectSessionById(roomId)(state) : null;

  const taskId = selectThreadTaskId(threadId)(state);
  const task = taskId ? selectTaskById(state, taskId) : undefined;
  const subtaskCount = taskId
    ? selectSubtasksByParent(state, taskId).length
    : 0;

  const noteId = selectActiveNoteId(threadId)(state);
  const note = noteId ? selectNoteById(noteId)(state) : undefined;

  const audioSessionIds = selectAudioSessionIdsForThread(threadId)(state);
  const rows = selectContentAssignmentsForThread(threadId)(state);
  const attachments = selectAttachmentsForThread(threadId)(state);

  const projectId = roomId
    ? selectEffectiveThreadProjectId(threadId, roomId)(state)
    : null;
  const projectName = projectId
    ? selectProjectById(state, projectId)?.name
    : undefined;

  const anchorType = thread?.anchor_type ?? "canvas";
  const anchorLabel =
    anchorType === "task"
      ? (task?.title?.trim() || thread?.title?.trim() || "task")
      : anchorType === "project"
        ? (projectName?.trim() || thread?.title?.trim() || "project")
        : "canvas";

  const siblingIds = roomId
    ? selectThreadIdsForRoom(roomId)(state).filter((id) => id !== threadId)
    : [];
  const sibling_threads: WarRoomSiblingThreadEntry[] = siblingIds.map(
    (id, index) => {
      const sibling = selectThreadById(id)(state);
      const siblingTaskId = selectThreadTaskId(id)(state);
      const siblingTask = siblingTaskId
        ? selectTaskById(state, siblingTaskId)
        : undefined;
      return {
        id,
        title: threadLabel(state, id, index),
        anchor_type: sibling?.anchor_type ?? "canvas",
        ...(siblingTask?.title ? { task_title: siblingTask.title } : {}),
      };
    },
  );

  const resources: WarRoomThreadResourceEntry[] = rows.map(toResourceEntry);
  const noteContent = (note?.content ?? "").trim();

  return createWarRoomThreadScope({
    thread_id: threadId,
    thread_anchor: { type: anchorType, id: thread?.anchor_id ?? null },
    thread_anchor_label: anchorLabel,
    active_tab: normalizeThreadTab(thread?.active_tab ?? null),
    thread_position: thread?.position ?? 0,
    is_pinned: selectThreadIsPinned(threadId)(state),
    thread_organization_id:
      thread?.organization_id ?? room?.organization_id ?? "",
    subtask_count: subtaskCount,
    audio_session_ids: [...audioSessionIds],
    has_audio: audioSessionIds.length > 0,
    thread_resources: resources,
    thread_resource_counts: countByToken(rows),
    attached_file_ids: attachments.map((a) => a.entity_id),
    pinned_resource_ids: rows.filter(isPinnedEdge).map((a) => a.entity_id),
    room_thread_count: siblingIds.length + 1,
    sibling_threads,

    thread_title: thread?.title?.trim() || undefined,
    room_id: roomId ?? undefined,
    room_name: room?.title?.trim() || undefined,
    project_id: projectId ?? undefined,
    project_name: projectName ?? undefined,
    task_id: taskId ?? undefined,
    task_title: task?.title || undefined,
    task_status: task?.status || undefined,
    note_id: noteId ?? undefined,
    note_title: note?.label || undefined,
    note_content: noteContent || undefined,
    active_audio_session_id:
      selectActiveAudioSessionId(threadId)(state) ?? undefined,
    conversation_id: selectActiveConversationId(threadId)(state) ?? undefined,
    assistant_agent_id: extras.assistantAgentId ?? undefined,
  });
}
