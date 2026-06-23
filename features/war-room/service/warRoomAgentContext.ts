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
 * Merged in by `TileAgentPanel` via `useStudioAssistant`'s `buildExtraEntries`;
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
  selectAttachmentsForTile,
  selectAudioSessionIdsForTile,
  selectSessionById,
  selectTileById,
  selectTileIdsForSession,
  selectTileTaskId,
} from "@/features/war-room/redux/selectors";
import type { WarRoomTile } from "@/features/war-room/types";
import {
  buildWarRoomContextEntry,
  type WarRoomContextModel,
  type WarRoomRoomModel,
  type WarRoomThreadModel,
} from "@/features/war-room/service/warRoomContextXml";

/** A readable thread label — its own title, else its task's, else positional. */
function threadLabel(
  tile: WarRoomTile,
  taskTitle: string | undefined,
  index: number,
): string {
  const own = tile.title?.trim();
  if (own) return own;
  if (taskTitle?.trim()) return taskTitle.trim();
  return `Thread ${index + 1}`;
}

/** Build one thread model for a tile, reading whatever Redux has hydrated. */
function tileToThreadModel(
  state: RootState,
  tile: WarRoomTile,
  index: number,
): WarRoomThreadModel {
  const taskId = selectTileTaskId(tile.id)(state);
  const task = taskId ? selectTaskById(state, taskId) : undefined;
  const noteId = selectActiveNoteId(tile.id)(state);
  const note = noteId ? selectNoteById(noteId)(state) : undefined;
  const noteContent = (note?.content ?? "").trim();
  const audioCount = selectAudioSessionIdsForTile(tile.id)(state).length;
  const fileCount = selectAttachmentsForTile(tile.id)(state).length;

  return {
    id: tile.id,
    title: threadLabel(tile, task?.title, index),
    // Tier 1 doesn't resolve sibling conversation ids; the read tool takes the
    // tile id and resolves the chain itself.
    conversationId: null,
    taskId,
    taskTitle: task?.title,
    taskStatus: task?.status,
    noteId,
    noteChars: noteContent ? noteContent.length : undefined,
    hasAudio: audioCount > 0,
    fileCount,
  };
}

/**
 * Build the Tier-1 thread agent's context: a single inline `war_room` entry.
 * Returns `[]` only when the tile itself isn't in Redux (nothing to describe);
 * the no-empty-push guard then leaves prior context intact.
 */
export function buildTileAgentContextEntries(
  state: RootState,
  tileId: string,
): AssistantContextEntry[] {
  const tile = selectTileById(tileId)(state);
  if (!tile) return [];

  const roomId = tile.session_id;
  const room = roomId ? selectSessionById(roomId)(state) : null;
  const roomTitle = room?.title?.trim() || "this War Room";
  const projectId = room?.project_id ?? tile.project_id ?? null;
  const projectName = projectId
    ? (selectProjectById(state, projectId)?.name ?? undefined)
    : undefined;

  // Every thread in the room (best-effort — siblings beyond the current tile
  // are present once the room is hydrated). The current tile is always present.
  const siblingIds = roomId ? selectTileIdsForSession(roomId)(state) : [];
  const tileIds = siblingIds.includes(tileId)
    ? siblingIds
    : [tileId, ...siblingIds];

  const threads: WarRoomThreadModel[] = tileIds
    .map((id, index) => {
      const t = id === tileId ? tile : selectTileById(id)(state);
      return t ? tileToThreadModel(state, t, index) : null;
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
      "approves each). For this thread's transcripts, the ACTIVE recording is " +
      'in your studio context as `session_cleaned` when one exists; for any/all ' +
      'recordings use the data tool (resource_type "studio_session"). Read ' +
      "ANOTHER thread's chain with war_room_read_thread(thread_id=<its id>). " +
      "Read or edit any task / note / project / other resource by id with the " +
      "data / data_action tools.",
    room: roomModel,
    currentThreadId: tileId,
  };

  return [buildWarRoomContextEntry(model)];
}
