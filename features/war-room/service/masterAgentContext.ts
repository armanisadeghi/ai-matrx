/**
 * features/war-room/service/masterAgentContext.ts
 *
 * Builds the READ-ONLY context objects that let the War Room MASTER agent
 * (`/war-room/all`) SEE every room the user owns and every thread inside them —
 * as a compact ROSTER (an index), NOT full transcripts. The master reads a
 * specific thread's conversation chain via a tool LATER (the messaging-tools +
 * watch/notify build); v1 just gives it the map.
 *
 * Why a service-level async builder (not the Redux-driven `warRoomAgentContext`
 * sibling): the per-tile panel reads ONE room that is already hydrated in Redux.
 * The master spans ALL rooms — and Redux only ever holds the *active* room's
 * tiles / tasks / notes (see `loadWarRoomSession`). So this builder fetches the
 * cross-room data itself, owner-scoped (RLS enforces access), via the War Room
 * service + a few targeted reads (task titles, note snippets, and each thread
 * agent's conversation id off `studio_sessions.assistant_conversation_id`).
 *
 * Naming contract (so the model understands the relationships, and so these
 * never collide with the studio keys recording_NN / session_cleaned / etc. or
 * the tile_* keys):
 *   - `master_role`        — a short framing entry: what this agent oversees.
 *   - `war_room_overview`  — the structured roster: every room → its threads,
 *                            each thread carrying its title, the thread agent's
 *                            conversationId (so a later tool can read that
 *                            chain), its live status, and lightweight signal
 *                            (task title, note snippet, has-audio, file count).
 *
 * READ-ONLY: every value here is a plain data snapshot with NO `mutable` /
 * `source` keys, so the server exposes only `ctx_get` for them — never
 * `ctx_patch`. (Writing/messaging tools come later; this build is "see all",
 * not "act on all".) The read-only + usage emphasis lives in the value's
 * `_hint`, mirroring `warRoomAgentContext.ts`, so it survives even if the host
 * strips unknown entry-level keys.
 */

import { supabase } from "@/utils/supabase/client";
import type { AssistantContextEntry } from "@/features/transcript-studio/service/assistantContextBuilder";
import { getTaskById } from "@/features/tasks/services/taskService";
import { listSessions, listThreadsForRoom } from "@/features/war-room/service";
import { listAssignmentsForContainers } from "@/features/war-room/service/associations";
import {
  roomRef,
  threadRef,
  type WarRoomAssignment,
  type WarRoomSession,
  type WarRoomThread,
} from "@/features/war-room/types";
import {
  buildWarRoomContextEntry,
  type WarRoomRoomModel,
} from "@/features/war-room/service/warRoomContextXml";

/**
 * Index a flat list of thread assignment rows into the per-tile signals the
 * roster needs. Replaces the three deleted `list*ForTiles` link-table readers —
 * the polymorphic ctx_war_room_assignments table is now the single source. The
 * tile id is the assignment's `container_id` (container_type='thread').
 */
export interface ThreadAssignmentIndex {
  /** Active task id per tile (is_active row, else first by position). */
  taskByThread: Map<string, string>;
  /** Active note id per tile (is_active row, else first by position). */
  noteByThread: Map<string, string>;
  /** Active studio (audio) session id per tile. */
  activeAudioByThread: Map<string, string>;
  /** Tiles that have ANY audio session linked. */
  hasAudioByThread: Set<string>;
  /** File + document attachment count per tile. */
  fileCountByThread: Map<string, number>;
}

export function indexThreadAssignments(
  rows: WarRoomAssignment[],
): ThreadAssignmentIndex {
  const taskByThread = new Map<string, string>();
  const noteByThread = new Map<string, string>();
  const activeAudioByThread = new Map<string, string>();
  const hasAudioByThread = new Set<string>();
  const fileCountByThread = new Map<string, number>();

  // Prefer the is_active member of each single-active type; rows arrive ordered
  // by position so the first seen is the positional fallback.
  const pickActive = (
    map: Map<string, string>,
    row: WarRoomAssignment,
  ): void => {
    const threadId = row.container_id;
    if (row.is_active) map.set(threadId, row.entity_id);
    else if (!map.has(threadId)) map.set(threadId, row.entity_id);
  };

  for (const row of rows) {
    if (row.container_type !== "thread") continue;
    switch (row.entity_type) {
      case "task":
        pickActive(taskByThread, row);
        break;
      case "note":
        pickActive(noteByThread, row);
        break;
      case "studio_session":
        hasAudioByThread.add(row.container_id);
        pickActive(activeAudioByThread, row);
        break;
      case "user_file":
      case "document":
        fileCountByThread.set(
          row.container_id,
          (fileCountByThread.get(row.container_id) ?? 0) + 1,
        );
        break;
    }
  }

  return {
    taskByThread,
    noteByThread,
    activeAudioByThread,
    hasAudioByThread,
    fileCountByThread,
  };
}

// ── Read-only roster value shapes (plain data — no `mutable`/`source` ⇒ ctx_get) ──

/** One thread (tile) inside a room, as the master sees it in the roster. */
export interface MasterThreadEntry {
  threadId: string;
  threadTitle: string;
  /**
   * The thread agent's conversation id (the tile's Agent+ conversation =
   * `studio_sessions.assistant_conversation_id` for the tile's ACTIVE audio
   * session). `null` when the thread has no audio session yet, or that session
   * never minted an assistant conversation — i.e. nothing for a later tool to
   * read. This is the seam the messaging-tools build keys off.
   */
  conversationId: string | null;
  /** Live request status of that thread's agent, when one is running/visible. */
  status?: string;
  /** The thread's task title (read-only signal — not the full task). */
  taskTitle?: string;
  /** A short snippet of the thread's active note (first ~140 chars). */
  noteSnippet?: string;
  /** Whether the thread has any linked audio/recording session. */
  hasAudio: boolean;
  /** How many files/documents are attached to the thread. */
  fileCount: number;
}

/** One room in the roster: identity + its threads. */
export interface MasterRoomEntry {
  roomId: string;
  title: string;
  description: string | null;
  threadCount: number;
  threads: MasterThreadEntry[];
}

// The master's read-only context is now the single inline `war_room` block
// (scope="all") — see warRoomContextXml.ts. No per-key overview/role dicts.

// ── Helpers ──────────────────────────────────────────────────────────────

function noteSnippet(content: string | null | undefined): string | undefined {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

/** A human label for a thread (tile) — its own title, else its task title,
 *  else a positional fallback. Keeps the roster readable when tiles are
 *  unnamed (the common early case). */
function threadTitle(
  thread: WarRoomThread,
  taskTitle: string | undefined,
  index: number,
): string {
  const own = thread.title?.trim();
  if (own) return own;
  if (taskTitle?.trim()) return taskTitle.trim();
  return `Thread ${index + 1}`;
}

// ── Builder ──────────────────────────────────────────────────────────────

/**
 * Optional live-status resolver. The builder is a pure service function with no
 * Redux access, but per-thread live status lives in the active-requests slice
 * (`selectPrimaryRequest(conversationId)?.status`). The hook — which owns the
 * store — passes this so the roster carries accurate live status without the
 * service reaching into Redux. Omitted ⇒ the roster simply has no `status`.
 */
export type ThreadStatusResolver = (
  conversationId: string,
) => string | undefined;

/**
 * Assemble the master agent's READ-ONLY cross-room context entries.
 *
 * Returns `master_role` + `war_room_overview`. The role entry is ALWAYS
 * present (so the hook's no-empty guard never has to drop the push), even when
 * the user has zero rooms — the overview then just reports an empty roster.
 *
 * All reads are owner-scoped: the War Room service already filters by the
 * authenticated user, and the task/note/studio_sessions reads below are RLS-
 * gated to the same user. This never mutates anything.
 */
export async function buildMasterAgentContext(
  resolveStatus?: ThreadStatusResolver,
): Promise<AssistantContextEntry[]> {
  const masterRole =
    "You are the War Room master agent. You oversee ALL of the user's War " +
    "Rooms and every thread inside them — the full roster is listed below. " +
    "Help the user reason across rooms: find, compare, prioritize, summarize. " +
    "Read a thread's chain or message its agent with your tools.";
  const masterHowTo =
    "Read a thread's chain with war_room_read_thread(thread_id). Message a " +
    "thread's agent with war_room_message_thread(thread_id). Create or rename " +
    "a room with war_room_create_room / war_room_rename_room. Read or edit any " +
    "resource by id with the data / data_action tools.";

  let sessions: WarRoomSession[] = [];
  try {
    sessions = await listSessions();
  } catch (err) {
    // Loud recovery: the master can still chat, but its overview will be empty.
    // Surface the failure rather than silently shipping a blank roster.
    console.error("[war-room/master] listSessions failed:", err);
  }

  if (sessions.length === 0) {
    return [
      buildWarRoomContextEntry({
        scope: "all",
        role: masterRole,
        howTo: masterHowTo,
        rooms: [],
      }),
    ];
  }

  // Fetch every room's tiles in parallel, then the assignment data for the full
  // tile set in one batched query (listAssignmentsForContainers).
  const threadsByRoom = await Promise.all(
    sessions.map(async (s) => {
      try {
        return { sessionId: s.id, threads: await listThreadsForRoom(s.id) };
      } catch (err) {
        console.error(
          `[war-room/master] listThreadsForRoom failed for room ${s.id}:`,
          err,
        );
        return { sessionId: s.id, threads: [] as WarRoomThread[] };
      }
    }),
  );

  const allThreads: WarRoomThread[] = threadsByRoom.flatMap((r) => r.threads);
  const allThreadIds = allThreads.map((t) => t.id);

  // ONE batched read of the polymorphic assignment table for every tile (thread
  // container), then index per tile. Tolerates failure — a missing signal just
  // omits that field from the roster, never blocks it.
  let assignments: WarRoomAssignment[] = [];
  try {
    assignments = await listAssignmentsForContainers([
      ...allThreadIds.map((id) => threadRef(id)),
      ...sessions.map((s) => roomRef(s.id)),
    ]);
  } catch (err) {
    console.error(
      "[war-room/master] listAssignmentsForContainers failed:",
      err,
    );
  }
  const {
    taskByThread,
    noteByThread: activeNoteByThread,
    activeAudioByThread,
    hasAudioByThread,
    fileCountByThread,
  } = indexThreadAssignments(assignments);

  // ── Resolve the thread agent conversation ids in one query ─────────────
  // The thread agent's conversation id = studio_sessions.assistant_conversation_id
  // for the tile's ACTIVE audio session. We query studio_sessions DIRECTLY (not
  // studioService.listSessions/getSession — those exclude source='war_room').
  const activeStudioSessionIds = [
    ...new Set([...activeAudioByThread.values()]),
  ];
  const convoBySession = new Map<string, string | null>();
  if (activeStudioSessionIds.length > 0) {
    const { data, error } = await supabase
      .from("studio_sessions")
      .select("id,assistant_conversation_id")
      .in("id", activeStudioSessionIds);
    if (error) {
      console.error(
        "[war-room/master] studio_sessions assistant_conversation_id read failed:",
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
  // chokepoint (ESLint enforces). Batched via Promise.all (the rooms-roster is
  // a low-frequency, on-open build, so N small reads are acceptable here).
  const taskIds = [
    ...new Set(
      allThreads
        .map((t) => taskByThread.get(t.id) ?? null)
        .filter((id): id is string => !!id),
    ),
  ];
  const taskTitleById = new Map<string, string>();
  if (taskIds.length > 0) {
    const tasks = await Promise.all(
      taskIds.map((id) =>
        getTaskById(id).catch((err) => {
          console.error(`[war-room/master] getTaskById failed for ${id}:`, err);
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
      allThreads
        .map((t) => activeNoteByThread.get(t.id) ?? null)
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
      console.error("[war-room/master] notes snippet read failed:", error);
    } else {
      for (const row of data ?? []) noteContentById.set(row.id, row.content);
    }
  }

  // ── Assemble the roster ────────────────────────────────────────────────
  const threadsBySessionId = new Map<string, WarRoomThread[]>();
  for (const { sessionId, threads } of threadsByRoom) {
    threadsBySessionId.set(sessionId, threads);
  }

  const roomProjectById = new Map<string, string | null>();
  for (const a of assignments) {
    if (
      a.container_type === "room" &&
      a.entity_type === "project" &&
      a.is_active
    ) {
      roomProjectById.set(a.container_id, a.entity_id);
    }
  }

  const rooms: MasterRoomEntry[] = sessions.map((session) => {
    const threads = threadsBySessionId.get(session.id) ?? [];
    const roster: MasterThreadEntry[] = threads.map((thread, index) => {
      const taskId = taskByThread.get(thread.id) ?? null;
      const taskTitle = taskId ? taskTitleById.get(taskId) : undefined;
      const noteId = activeNoteByThread.get(thread.id) ?? null;
      const snippet = noteId
        ? noteSnippet(noteContentById.get(noteId))
        : undefined;
      const activeStudioId = activeAudioByThread.get(thread.id) ?? null;
      const conversationId = activeStudioId
        ? (convoBySession.get(activeStudioId) ?? null)
        : null;

      const entry: MasterThreadEntry = {
        threadId: thread.id,
        threadTitle: threadTitle(thread, taskTitle, index),
        conversationId,
        hasAudio: hasAudioByThread.has(thread.id),
        fileCount: fileCountByThread.get(thread.id) ?? 0,
      };
      const status = conversationId
        ? resolveStatus?.(conversationId)
        : undefined;
      if (status) entry.status = status;
      if (taskTitle) entry.taskTitle = taskTitle;
      if (snippet) entry.noteSnippet = snippet;
      return entry;
    });

    return {
      roomId: session.id,
      title: session.title,
      description: session.description ?? null,
      threadCount: threads.length,
      threads: roster,
    };
  });

  const roomModels: WarRoomRoomModel[] = rooms.map((r) => {
    const projectId = roomProjectById.get(r.roomId) ?? null;
    return {
      id: r.roomId,
      title: r.title,
      description: r.description,
      basis: projectId ? "project" : "standalone",
      projectId,
      threads: r.threads.map((e) => ({
        id: e.threadId,
        title: e.threadTitle,
        conversationId: e.conversationId,
        status: e.status,
        taskTitle: e.taskTitle,
        noteSnippet: e.noteSnippet,
        hasAudio: e.hasAudio,
        fileCount: e.fileCount,
      })),
    };
  });

  return [
    buildWarRoomContextEntry({
      scope: "all",
      role: masterRole,
      howTo: masterHowTo,
      rooms: roomModels,
    }),
  ];
}
