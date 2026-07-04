/**
 * features/war-room/service/warRoomAgentContext.ts
 *
 * Builds the TIER-1 (per-thread / tile) War Room agent's context: the ONE
 * inline `war_room` block (scope="thread"). The agent instantly sees, with no
 * tool call, where it is — its current thread in full (task, note, audio,
 * files) AND the rest of the room around it (every sibling thread with its
 * task/status), plus the room's project. It pulls heavy bodies with tools.
 *
 * This REPLACED the old pile of deferred dicts (`tile_task` / `tile_notes` /
 * `tile_files`): those rendered DEFERRED (a dict over ~200 chars), so the agent
 * had to `ctx_get` even to read its own task. One small inline overview + tools
 * for the details is the contract — see `warRoomContextXml.ts` (the single
 * `war_room` serializer shared by all three tiers).
 *
 * Sync + Redux-only: the active room's tiles, tasks, notes, attachments, and
 * audio links are all hydrated on room load, so this never fetches. Sibling
 * threads are listed by their TILE id — the agent reads a sibling's chain with
 * `war_room_read_thread(thread_id=<tile id>)` (the handler resolves the
 * conversation server-side), so no sibling conversation id is needed here.
 *
 * Merged in by `ThreadAgentPanel` via `useStudioAssistant`'s `buildExtraEntries`;
 * the audio transcript (`session_cleaned` / `working_document`) is already in
 * the studio context, so it is NOT duplicated here.
 */

import type { RootState } from "@/lib/redux/store";
import type { AssistantContextEntry } from "@/features/transcript-studio/service/assistantContextBuilder";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { selectNoteById } from "@/features/notes/redux/selectors";
import {
  selectActiveNoteId,
  selectActiveSessionId,
  selectAttachmentsForThread,
  selectAudioSessionIdsForThread,
  selectContentAssignmentsForThread,
  selectEffectiveThreadProjectId,
  selectSessionById,
  selectThreadById,
  selectThreadIdsForRoom,
  selectThreadTaskId,
} from "@/features/war-room/redux/selectors";
import type {
  WarRoomAssignment,
  WarRoomThread,
} from "@/features/war-room/types";
import { selectFileById, selectRagStatusForFile } from "@/features/files";
import { getThreadFileRagIndexed } from "@/features/war-room/service/threadFileRagCache";
import { getCachedEntityTitle } from "@/features/scopes/service/entityTitles";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { entityToSource } from "@/features/war-room/service/associations";
import {
  buildWarRoomContextEntry,
  type WarRoomContextModel,
  type WarRoomResourceCount,
  type WarRoomResourceModel,
  type WarRoomRoomModel,
  type WarRoomThreadModel,
} from "@/features/war-room/service/warRoomContextXml";

/** A readable thread label — its own title, else its task's, else positional. */
function threadLabel(
  thread: WarRoomThread,
  taskTitle: string | undefined,
  index: number,
): string {
  const own = thread.title?.trim();
  if (own) return own;
  if (taskTitle?.trim()) return taskTitle.trim();
  return `Thread ${index + 1}`;
}

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Resolve one assignment row into a titled, token-canonical resource. */
function assignmentToResource(
  state: RootState,
  a: WarRoomAssignment,
): WarRoomResourceModel {
  const token = entityToSource(a.entity_type);
  const md = isPlainObj(a.metadata) ? a.metadata : {};
  let title = a.label?.trim() ?? "";
  let attrs: WarRoomResourceModel["attrs"];

  if (token === "file") {
    // Files carry their read/search signals as row attrs (the old <files>
    // manifest, folded into <resources>).
    const record = selectFileById(state, a.entity_id);
    title = record?.fileName ?? title;
    let hasExtraction: boolean | undefined;
    if (record?.canonicalProcessedDocumentId != null) hasExtraction = true;
    else {
      const ragSlice = selectRagStatusForFile(state, a.entity_id);
      if (ragSlice === "indexed") hasExtraction = true;
      else if (ragSlice === "not_indexed") hasExtraction = false;
    }
    const ragIndexed = getThreadFileRagIndexed(a.entity_id);
    attrs = {
      mime: record?.mimeType ?? undefined,
      extraction:
        hasExtraction === undefined ? undefined : hasExtraction ? "yes" : "no",
      rag:
        ragIndexed === undefined ? undefined : ragIndexed ? "indexed" : "no",
    };
  } else if (a.entity_type === "task") {
    title = selectTaskById(state, a.entity_id)?.title ?? title;
  } else if (a.entity_type === "note") {
    title = selectNoteById(a.entity_id)(state)?.label ?? title;
  }

  if (!title) {
    title =
      getCachedEntityTitle(token, a.entity_id) ??
      `Untitled ${tryGetEntityInfo(token)?.label ?? token}`;
  }

  return {
    token,
    id: a.entity_id,
    title,
    pinned: md.pinned === true,
    ...(attrs ? { attrs } : {}),
  };
}

/** Per-token counts (canonical tokens) for a thread's roster attribute. */
function countResources(rows: WarRoomAssignment[]): WarRoomResourceCount[] {
  const counts = new Map<string, number>();
  for (const a of rows) {
    const token = entityToSource(a.entity_type);
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].map(([token, count]) => ({ token, count }));
}

/** Build one thread model, reading whatever Redux has hydrated. */
function threadToThreadModel(
  state: RootState,
  thread: WarRoomThread,
  index: number,
  withFiles: boolean,
): WarRoomThreadModel {
  const taskId = selectThreadTaskId(thread.id)(state);
  const task = taskId ? selectTaskById(state, taskId) : undefined;
  const noteId = selectActiveNoteId(thread.id)(state);
  const note = noteId ? selectNoteById(noteId)(state) : undefined;
  const noteContent = (note?.content ?? "").trim();
  const audioCount = selectAudioSessionIdsForThread(thread.id)(state).length;
  const attachments = selectAttachmentsForThread(thread.id)(state);
  const allRows = selectContentAssignmentsForThread(thread.id)(state);

  // The full <resources> roster for the CURRENT thread: every content row of
  // every registered type, minus what the dedicated lines already show (the
  // active task/note and audio sessions — non-active extras stay listed).
  const resources = withFiles
    ? allRows
        .filter(
          (a) =>
            !(a.entity_type === "task" && a.entity_id === taskId) &&
            !(a.entity_type === "note" && a.entity_id === noteId) &&
            a.entity_type !== "studio_session",
        )
        .map((a) => assignmentToResource(state, a))
    : undefined;
  const resourceCounts = countResources(allRows);
  const pinnedResources = withFiles
    ? undefined // current thread lists everything already, pinned-first
    : allRows
        .filter((a) => isPlainObj(a.metadata) && a.metadata.pinned === true)
        .map((a) => assignmentToResource(state, a));

  return {
    id: thread.id,
    title: threadLabel(thread, task?.title, index),
    // Hydrated by loadWarRoomSession (studio_sessions.assistant_conversation_id
    // of the active audio session) — the handle for cross-agent reads.
    conversationId:
      state.warRoom.agentConversationByThread[thread.id] ?? null,
    taskId,
    taskTitle: task?.title,
    taskStatus: task?.status,
    noteId,
    noteChars: noteContent ? noteContent.length : undefined,
    hasAudio: audioCount > 0,
    fileCount: attachments.length,
    ...(resources && resources.length > 0 ? { resources } : {}),
    ...(resourceCounts.length > 0 ? { resourceCounts } : {}),
    ...(pinnedResources && pinnedResources.length > 0
      ? { pinnedResources }
      : {}),
  };
}

/**
 * Build the Tier-1 thread agent's context: a single inline `war_room` entry.
 */
export function buildThreadAgentContextEntries(
  state: RootState,
  threadId: string,
): AssistantContextEntry[] {
  const thread = selectThreadById(threadId)(state);
  if (!thread) return [];

  const roomId = selectActiveSessionId(state);
  const room = roomId ? selectSessionById(roomId)(state) : null;
  const roomTitle = room?.title?.trim() || "this War Room";
  const projectId = roomId
    ? selectEffectiveThreadProjectId(threadId, roomId)(state)
    : null;
  const projectName = projectId
    ? (selectProjectById(state, projectId)?.name ?? undefined)
    : undefined;

  const siblingIds = roomId ? selectThreadIdsForRoom(roomId)(state) : [];
  const threadIds = siblingIds.includes(threadId)
    ? siblingIds
    : [threadId, ...siblingIds];

  const threads: WarRoomThreadModel[] = threadIds
    .map((id, index) => {
      const t = id === threadId ? thread : selectThreadById(id)(state);
      return t ? threadToThreadModel(state, t, index, id === threadId) : null;
    })
    .filter((t): t is WarRoomThreadModel => t !== null);

  const roomModel: WarRoomRoomModel = {
    id: roomId ?? "",
    title: roomTitle,
    basis: projectId ? "project" : "standalone",
    projectId,
    projectName,
    threads,
  };

  const model: WarRoomContextModel = {
    scope: "thread",
    role:
      `You are the agent for ONE thread inside the War Room "${roomTitle}". ` +
      "Work the thread marked <current_thread>; the rest of the room is shown " +
      "so you have the full picture. Everything you need is here — do not " +
      "re-query the database to rediscover it; use your tools to pull a " +
      "specific body or to act.",
    howTo:
      "Edit THIS thread's task/note with your war_room tools (the user " +
      "approves each). EVERYTHING attached to this thread is listed in " +
      "<resources> — any type: files, documents, datasets, data stores, " +
      "flashcards, … The <access> legend maps each type to the exact tool " +
      "that reads or searches it (server tools like data / data_action / " +
      "document / rag_search are preferred; war_room_read_resource(" +
      "entity_type, entity_id) reads ANY listed resource, and " +
      "entity_type='thread' returns a thread's full attachment manifest). " +
      'A data_store row means: rag_search(query, data_store_id=<its id>) — ' +
      "the user attached that knowledge store for you to USE. Rows with " +
      'pin="1" are the user\'s must-use resources. For this thread\'s ' +
      "transcripts, the ACTIVE recording is in your studio context as " +
      "`session_cleaned` when one exists; for any/all recordings use the " +
      'data tool (resource_type "studio_session"). Read ANOTHER thread\'s ' +
      "chain with war_room_read_thread(thread_id=<its id>).",
    room: roomModel,
    currentThreadId: threadId,
  };

  return [buildWarRoomContextEntry(model)];
}
