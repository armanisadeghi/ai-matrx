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
import {
  listSessions,
  listTiles,
  listAudioLinksForTiles,
  listNoteLinksForTiles,
  listAttachmentsForTiles,
} from "@/features/war-room/service";
import type {
  WarRoomSession,
  WarRoomTile,
  WarRoomTileAudioSession,
  WarRoomTileNote,
  WarRoomTileAttachment,
} from "@/features/war-room/types";
import {
  buildWarRoomContextEntry,
  type WarRoomRoomModel,
} from "@/features/war-room/service/warRoomContextXml";

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
  tile: WarRoomTile,
  taskTitle: string | undefined,
  index: number,
): string {
  const own = tile.title?.trim();
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

  // Fetch every room's tiles in parallel, then the link/attachment data for the
  // full tile set in one batched query each (the service `*ForTiles` helpers).
  const tilesByRoom = await Promise.all(
    sessions.map(async (s) => {
      try {
        return { sessionId: s.id, tiles: await listTiles(s.id) };
      } catch (err) {
        console.error(
          `[war-room/master] listTiles failed for room ${s.id}:`,
          err,
        );
        return { sessionId: s.id, tiles: [] as WarRoomTile[] };
      }
    }),
  );

  const allTiles: WarRoomTile[] = tilesByRoom.flatMap((r) => r.tiles);
  const allTileIds = allTiles.map((t) => t.id);

  // Batched cross-tile reads. Each tolerates failure independently — a missing
  // signal just omits that field from the roster, never blocks it.
  const [audioLinks, noteLinks, attachments] = await Promise.all([
    listAudioLinksForTiles(allTileIds).catch((err) => {
      console.error("[war-room/master] listAudioLinksForTiles failed:", err);
      return [] as WarRoomTileAudioSession[];
    }),
    listNoteLinksForTiles(allTileIds).catch((err) => {
      console.error("[war-room/master] listNoteLinksForTiles failed:", err);
      return [] as WarRoomTileNote[];
    }),
    listAttachmentsForTiles(allTileIds).catch((err) => {
      console.error("[war-room/master] listAttachmentsForTiles failed:", err);
      return [] as WarRoomTileAttachment[];
    }),
  ]);

  // ── Index the batched links per tile ──────────────────────────────────
  // Active audio session per tile (the one whose Agent+ conversation we want).
  const activeAudioByTile = new Map<string, string>();
  const hasAudioByTile = new Set<string>();
  for (const link of audioLinks) {
    hasAudioByTile.add(link.tile_id);
    if (link.is_active) activeAudioByTile.set(link.tile_id, link.studio_session_id);
  }
  // Fall back to the first linked session when none is flagged active.
  for (const link of audioLinks) {
    if (!activeAudioByTile.has(link.tile_id)) {
      activeAudioByTile.set(link.tile_id, link.studio_session_id);
    }
  }

  // Active note id per tile (prefer the flagged-active link; the tile.note_id
  // pointer is the secondary source, handled below per-tile).
  const activeNoteByTile = new Map<string, string>();
  for (const link of noteLinks) {
    if (link.is_active && !activeNoteByTile.has(link.tile_id)) {
      activeNoteByTile.set(link.tile_id, link.note_id);
    }
  }
  for (const link of noteLinks) {
    if (!activeNoteByTile.has(link.tile_id)) {
      activeNoteByTile.set(link.tile_id, link.note_id);
    }
  }

  const fileCountByTile = new Map<string, number>();
  for (const a of attachments) {
    fileCountByTile.set(a.tile_id, (fileCountByTile.get(a.tile_id) ?? 0) + 1);
  }

  // ── Resolve the thread agent conversation ids in one query ─────────────
  // The thread agent's conversation id = studio_sessions.assistant_conversation_id
  // for the tile's ACTIVE audio session. We query studio_sessions DIRECTLY (not
  // studioService.listSessions/getSession — those exclude source='war_room').
  const activeStudioSessionIds = [
    ...new Set([...activeAudioByTile.values()]),
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
    ...new Set(allTiles.map((t) => t.task_id).filter((id): id is string => !!id)),
  ];
  const taskTitleById = new Map<string, string>();
  if (taskIds.length > 0) {
    const tasks = await Promise.all(
      taskIds.map((id) =>
        getTaskById(id).catch((err) => {
          console.error(
            `[war-room/master] getTaskById failed for ${id}:`,
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

  // Note ids: the active link OR the tile's own note_id pointer.
  const noteIds = [
    ...new Set(
      allTiles
        .map((t) => activeNoteByTile.get(t.id) ?? t.note_id ?? null)
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
  const tilesBySessionId = new Map<string, WarRoomTile[]>();
  for (const { sessionId, tiles } of tilesByRoom) {
    tilesBySessionId.set(sessionId, tiles);
  }

  const rooms: MasterRoomEntry[] = sessions.map((session) => {
    const tiles = tilesBySessionId.get(session.id) ?? [];
    const threads: MasterThreadEntry[] = tiles.map((tile, index) => {
      const taskTitle = tile.task_id
        ? taskTitleById.get(tile.task_id)
        : undefined;
      const noteId = activeNoteByTile.get(tile.id) ?? tile.note_id ?? null;
      const snippet = noteId
        ? noteSnippet(noteContentById.get(noteId))
        : undefined;
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

    return {
      roomId: session.id,
      title: session.title,
      description: session.description ?? null,
      threadCount: threads.length,
      threads,
    };
  });

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const roomModels: WarRoomRoomModel[] = rooms.map((r) => {
    const projectId = sessionById.get(r.roomId)?.project_id ?? null;
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
