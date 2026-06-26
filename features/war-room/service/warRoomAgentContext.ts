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
import {
  buildWarRoomContextEntry,
  type WarRoomContextModel,
  type WarRoomFileModel,
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

/**
 * Build the per-file manifest for ONE thread from its attachment rows + the
 * files slice. Best-effort flags:
 *   - hasExtraction ← the file's `canonicalProcessedDocumentId` (the canonical
 *     "has OUR extraction" signal), else the cloudFiles `ragStatus` slice
 *     (extraction-presence: indexed ⇒ yes, not_indexed ⇒ no), else undefined.
 *   - ragIndexed ← the searchable-RAG probe cache (filled by ThreadAgentPanel's
 *     prefetch); undefined when not yet probed — OMITTED, never guessed.
 * `name` prefers the file slice's `fileName`, falling back to the assignment
 * `label`. Documents (entity_type='document') carry no cld_files extraction —
 * they're read via the agent's `document` tool, so flags stay undefined.
 */
function buildThreadFiles(
  state: RootState,
  attachments: WarRoomAssignment[],
): WarRoomFileModel[] {
  return attachments.map((a): WarRoomFileModel => {
    const kind: "file" | "document" =
      a.entity_type === "document" ? "document" : "file";
    const record =
      kind === "file" ? selectFileById(state, a.entity_id) : undefined;
    const name = record?.fileName ?? a.label ?? "untitled";
    const mime = record?.mimeType ?? undefined;

    let hasExtraction: boolean | undefined;
    if (kind === "file") {
      if (record?.canonicalProcessedDocumentId != null) {
        hasExtraction = true;
      } else {
        const ragSlice = selectRagStatusForFile(state, a.entity_id);
        if (ragSlice === "indexed") hasExtraction = true;
        else if (ragSlice === "not_indexed") hasExtraction = false;
        // "pending" / "unknown" / undefined ⇒ leave unknown (omit the flag).
      }
    }

    const ragIndexed =
      kind === "file" ? getThreadFileRagIndexed(a.entity_id) : undefined;

    return {
      id: a.entity_id,
      name,
      ...(mime ? { mime } : {}),
      kind,
      ...(hasExtraction === undefined ? {} : { hasExtraction }),
      ...(ragIndexed === undefined ? {} : { ragIndexed }),
    };
  });
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

  return {
    id: thread.id,
    title: threadLabel(thread, task?.title, index),
    conversationId: null,
    taskId,
    taskTitle: task?.title,
    taskStatus: task?.status,
    noteId,
    noteChars: noteContent ? noteContent.length : undefined,
    hasAudio: audioCount > 0,
    fileCount: attachments.length,
    ...(withFiles && attachments.length > 0
      ? { files: buildThreadFiles(state, attachments) }
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
      "approves each). To READ an attached file's text, call " +
      'data_action(operation="read_file_extraction", inputs={file_id:<id from ' +
      '<files>>, mode:"clean"}) — it returns OUR extracted text on the SERVER ' +
      '(mode "clean" tidied / "raw" verbatim), never the raw PDF, and never ' +
      'suspends the conversation; only files with extraction="yes" are readable. ' +
      'To SEARCH files indexed for RAG (rag="indexed") use rag_search ' +
      "(source_kinds includes 'cld_file'; pass source_ids=[file_id] to scope the " +
      "search to specific files). A document-kind attachment is read with your " +
      "document tool. For this thread's transcripts, the ACTIVE recording is in " +
      "your studio context as `session_cleaned` when one exists; for any/all " +
      'recordings use the data tool (resource_type "studio_session"). Read ' +
      "ANOTHER thread's chain with war_room_read_thread(thread_id=<its id>). " +
      "Read or edit any task / note / project / other resource by id with the " +
      "data / data_action tools.",
    room: roomModel,
    currentThreadId: threadId,
  };

  return [buildWarRoomContextEntry(model)];
}
