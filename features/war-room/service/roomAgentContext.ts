/**
 * features/war-room/service/roomAgentContext.ts
 *
 * Builds the READ-ONLY context objects that let a War Room's TIER-2 ROOM agent
 * (lives in the room shell, on `/war-room/[id]`) SEE every thread inside THAT
 * ONE room — as a compact ROSTER (an index), NOT full transcripts. The room
 * agent reads a specific thread's conversation chain via a tool (the shared
 * war-room-master-tools messaging family); this builder just gives it the map of
 * its own room.
 *
 * This is the MASTER agent NARROWED to a single room. `masterAgentContext.ts` is
 * the sibling that spans ALL rooms; the only structural difference here is the
 * roster covers exactly one session's tiles (so the agent acts within its room),
 * the framing entry is `room_agent_role` (vs `master_role`), and the roster entry
 * is `war_room_threads` (vs the all-rooms `war_room_overview`). The per-thread
 * shape is identical so a single tool set + threadResolver works for both tiers.
 *
 * Why a service-level async builder (not the Redux-driven `warRoomAgentContext`
 * sibling): although the room's tiles ARE hydrated in Redux while the shell is
 * open, the per-thread agent conversation id, task titles, and note snippets need
 * the same targeted cross-table reads the master builder does. Reusing the master
 * builder's exact read path (war-room service `getSession`/`listTiles` +
 * `listAssignmentsForContainers` + the studio_sessions / ctx_tasks / notes reads)
 * keeps the two tiers byte-for-byte consistent and avoids a second, drifting
 * roster shape.
 *
 * Naming contract (so the model understands the relationships, and so these never
 * collide with the studio keys recording_NN / session_cleaned / etc., the tile_*
 * keys, or the master's master_role / war_room_overview keys):
 *   - `room_agent_role`   — a short framing entry: you oversee THIS one room.
 *   - `war_room_threads`  — the structured roster: every thread in THIS room,
 *                           each carrying its title, the thread agent's
 *                           conversationId (so a tool can read that chain), its
 *                           live status, and lightweight signal (task title,
 *                           note snippet, has-audio, file count).
 *
 * READ-ONLY: every value here is a plain data snapshot with NO `mutable` /
 * `source` keys, so the server exposes only `ctx_get` for them — never
 * `ctx_patch`. (Acting on a thread — reading its full chain, messaging its agent,
 * renaming the room — comes through the dedicated tools.) The read-only + usage
 * emphasis lives in each value's `_hint`, mirroring `masterAgentContext.ts`, so
 * it survives even if the host strips unknown entry-level keys.
 */

import { supabase } from "@/utils/supabase/client";
import type { AssistantContextEntry } from "@/features/transcript-studio/service/assistantContextBuilder";
import { getTaskById } from "@/features/tasks/services/taskService";
import { getSession, listTiles } from "@/features/war-room/service";
import { listAssignmentsForContainers } from "@/features/war-room/service/associations";
import {
  threadRef,
  type WarRoomAssignment,
  type WarRoomTile,
} from "@/features/war-room/types";
import {
  indexThreadAssignments,
  type MasterThreadEntry,
  type ThreadStatusResolver,
} from "@/features/war-room/service/masterAgentContext";

// Re-export so the room hook (and any future consumer) imports the resolver type
// from the room module without reaching across to the master file.
export type { ThreadStatusResolver } from "@/features/war-room/service/masterAgentContext";
import {
  buildWarRoomContextEntry,
  type WarRoomThreadModel,
} from "@/features/war-room/service/warRoomContextXml";

// ── Read-only roster value shapes (plain data — no `mutable`/`source` ⇒ ctx_get) ──
// A thread carries the SAME shape the master roster uses (`MasterThreadEntry`),
// so the shared war-room-master-tools (read_thread / message_thread) resolve a
// thread the same way regardless of which tier surfaced it.

// The room's read-only context is now the single inline `war_room` block
// (scope="room") — see warRoomContextXml.ts. No per-key roster/role dicts.

// ── Helpers (identical semantics to masterAgentContext.ts) ─────────────────

function noteSnippet(content: string | null | undefined): string | undefined {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

/** A human label for a thread (tile) — its own title, else its task title, else
 *  a positional fallback. Keeps the roster readable when tiles are unnamed. */
function threadTitle(
  tile: WarRoomTile,
  taskTitle: string | undefined,
  index: number,
): string {
  const own = tile.title?.trim();
  if (own) return own;
  if (taskTitle?.trim()) return taskTitle.trim();
  return `Thread ${index + 1}`;
}

// ── Builder ────────────────────────────────────────────────────────────────

/**
 * Assemble the room agent's READ-ONLY context entries for ONE War Room.
 *
 * Returns `room_agent_role` + `war_room_threads`. The role entry is ALWAYS
 * present (so the hook's no-empty guard never has to drop the push), even when
 * the room has zero threads — the roster then just reports an empty thread list.
 *
 * All reads are owner-scoped: the war-room service filters by the authenticated
 * user (RLS-gated), and the task/note/studio_sessions reads below are RLS-gated
 * to the same user. This never mutates anything.
 *
 * @param sessionId      the War Room this agent oversees.
 * @param resolveStatus  optional live-status resolver (per-thread request status
 *                       from the active-requests slice) — injected by the hook,
 *                       which owns the store. Omitted ⇒ the roster has no status.
 */
export async function buildRoomAgentContext(
  sessionId: string,
  resolveStatus?: ThreadStatusResolver,
): Promise<AssistantContextEntry[]> {
  // Resolve the room's identity first (title used in the role framing + roster).
  let roomTitle = "this War Room";
  let projectId: string | null = null;
  try {
    const session = await getSession(sessionId);
    if (session?.title?.trim()) roomTitle = session.title.trim();
    projectId = session?.project_id ?? null;
  } catch (err) {
    // Loud recovery: the agent can still operate on the thread roster; only the
    // human-readable room name in the framing degrades.
    console.error(
      `[war-room/room-agent] getSession failed for ${sessionId}:`,
      err,
    );
  }

  const roomRole =
    `You are the agent for the War Room "${roomTitle}". You oversee its ` +
    "threads — every one is listed below — not the user's other rooms. Reason " +
    "across them: find, compare, prioritize, summarize. Read a thread's chain " +
    "or delegate into it with your thread tools. Act within this room.";
  const roomHowTo =
    "Read a thread's chain with war_room_read_thread(thread_id). Message a " +
    "thread's agent with war_room_message_thread(thread_id). Rename this room " +
    "with war_room_rename_room. Read or edit any task / note / project by id " +
    "with the data / data_action tools.";
  const toEntry = (
    threadModels: WarRoomThreadModel[],
  ): AssistantContextEntry =>
    buildWarRoomContextEntry({
      scope: "room",
      role: roomRole,
      howTo: roomHowTo,
      room: {
        id: sessionId,
        title: roomTitle,
        basis: projectId ? "project" : "standalone",
        projectId,
        threads: threadModels,
      },
    });

  // Tiles for THIS room only (the master builder fans out across every room; the
  // single-room scope is exactly what keeps this agent acting within its room).
  let tiles: WarRoomTile[] = [];
  try {
    tiles = await listTiles(sessionId);
  } catch (err) {
    console.error(
      `[war-room/room-agent] listTiles failed for ${sessionId}:`,
      err,
    );
  }

  if (tiles.length === 0) {
    return [toEntry([])];
  }

  const allTileIds = tiles.map((t) => t.id);

  // ONE batched read of the polymorphic assignment table for this room's tiles,
  // then index per tile (same helper the master builder uses). Tolerates failure
  // — a missing signal just omits that field from the roster, never blocks it.
  let assignments: WarRoomAssignment[] = [];
  try {
    assignments = await listAssignmentsForContainers(
      allTileIds.map((id) => threadRef(id)),
    );
  } catch (err) {
    console.error(
      "[war-room/room-agent] listAssignmentsForContainers failed:",
      err,
    );
  }
  const {
    taskByTile,
    noteByTile: activeNoteByTile,
    activeAudioByTile,
    hasAudioByTile,
    fileCountByTile,
  } = indexThreadAssignments(assignments);

  // ── Resolve the thread agent conversation ids in one query ─────────────
  // The thread agent's conversation id = studio_sessions.assistant_conversation_id
  // for the tile's ACTIVE audio session. We query studio_sessions DIRECTLY (not
  // studioService.listSessions/getSession — those exclude source='war_room').
  const activeStudioSessionIds = [...new Set([...activeAudioByTile.values()])];
  const convoBySession = new Map<string, string | null>();
  if (activeStudioSessionIds.length > 0) {
    const { data, error } = await supabase
      .from("studio_sessions")
      .select("id,assistant_conversation_id")
      .in("id", activeStudioSessionIds);
    if (error) {
      console.error(
        "[war-room/room-agent] studio_sessions assistant_conversation_id read failed:",
        error,
      );
    } else {
      for (const row of data ?? []) {
        convoBySession.set(row.id, row.assistant_conversation_id ?? null);
      }
    }
  }

  // ── Resolve task titles + note snippets ────────────────────────────────
  // Task titles go through the sanctioned tasks reader (`getTaskById`) rather
  // than a raw `ctx_*` query — `ctx_tasks` is owned by the scopes/tasks
  // chokepoint (ESLint enforces). The single-room roster is a low-frequency,
  // on-open build, so N small reads are acceptable here.
  const taskIds = [
    ...new Set(
      tiles
        .map((t) => taskByTile.get(t.id) ?? null)
        .filter((id): id is string => !!id),
    ),
  ];
  const taskTitleById = new Map<string, string>();
  if (taskIds.length > 0) {
    const tasks = await Promise.all(
      taskIds.map((id) =>
        getTaskById(id).catch((err) => {
          console.error(
            `[war-room/room-agent] getTaskById failed for ${id}:`,
            err,
          );
          return null;
        }),
      ),
    );
    for (const t of tasks) {
      if (t) taskTitleById.set(t.id, t.title);
    }
  }

  // Note ids: the active 'note' assignment per tile.
  const noteIds = [
    ...new Set(
      tiles
        .map((t) => activeNoteByTile.get(t.id) ?? null)
        .filter((id): id is string => !!id),
    ),
  ];
  const noteContentById = new Map<string, string | null>();
  if (noteIds.length > 0) {
    const { data, error } = await supabase
      .from("notes")
      .select("id,content")
      .in("id", noteIds)
      .eq("is_deleted", false);
    if (error) {
      console.error("[war-room/room-agent] notes snippet read failed:", error);
    } else {
      for (const row of data ?? []) noteContentById.set(row.id, row.content);
    }
  }

  // ── Assemble the roster (this room's threads only) ─────────────────────
  const threads: MasterThreadEntry[] = tiles.map((tile, index) => {
    const taskId = taskByTile.get(tile.id) ?? null;
    const taskTitle = taskId ? taskTitleById.get(taskId) : undefined;
    const noteId = activeNoteByTile.get(tile.id) ?? null;
    const snippet = noteId ? noteSnippet(noteContentById.get(noteId)) : undefined;
    const activeStudioId = activeAudioByTile.get(tile.id) ?? null;
    const conversationId = activeStudioId
      ? convoBySession.get(activeStudioId) ?? null
      : null;

    const entry: MasterThreadEntry = {
      threadId: tile.id,
      threadTitle: threadTitle(tile, taskTitle, index),
      conversationId,
      hasAudio: hasAudioByTile.has(tile.id),
      fileCount: fileCountByTile.get(tile.id) ?? 0,
    };
    const status = conversationId ? resolveStatus?.(conversationId) : undefined;
    if (status) entry.status = status;
    if (taskTitle) entry.taskTitle = taskTitle;
    if (snippet) entry.noteSnippet = snippet;
    return entry;
  });

  const threadModels: WarRoomThreadModel[] = threads.map((e) => ({
    id: e.threadId,
    title: e.threadTitle,
    conversationId: e.conversationId,
    status: e.status,
    taskTitle: e.taskTitle,
    noteSnippet: e.noteSnippet,
    hasAudio: e.hasAudio,
    fileCount: e.fileCount,
  }));
  return [toEntry(threadModels)];
}
