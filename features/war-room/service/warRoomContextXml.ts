/**
 * features/war-room/service/warRoomContextXml.ts
 *
 * THE single War Room context object. Every agent that lives inside the War
 * Room surface — the per-thread (tile) agent, the per-room agent, the all-rooms
 * master — gets ONE concise, INLINE, XML context entry under the key `war_room`
 * that tells it, instantly and without a tool call, exactly where it is and what
 * is around it: the room, what it's based on (a project / a task / on its own),
 * the threads, each thread's task + note + audio/transcript + files, AND each
 * thread's agent conversation id (so it can pull those messages with a tool).
 *
 * Why ONE inline XML object (not the old pile of deferred JSON dicts): a plain
 * dict over ~200 chars renders DEFERRED, so the agent had to `ctx_get` even to
 * read its own role. The user must NOT be dumped on — give the agent a small,
 * complete overview it sees in the prompt, plus the ids + a `<how_to>` line so
 * it fetches the heavy bodies with tools (`data`/`data_action` by id,
 * `war_room_read_thread` for another thread's chain, `ctx_get session_cleaned`
 * for this thread's transcript). High `max_inline_chars` forces it inline.
 *
 * READ-ONLY snapshot. Editing happens through the agent's tools, never by
 * patching this object. The single key `war_room` never collides with the
 * studio keys (recording_NN / session_cleaned / working_document).
 */

import type { AssistantContextEntry } from "@/features/transcript-studio/service/assistantContextBuilder";

export const WAR_ROOM_CONTEXT_KEY = "war_room";
/** Generous ceiling — far below the backend HARD_INLINE_CAP (50 000) — so the
 *  overview renders inline even for a busy room/master roster. */
const INLINE_CEIL = 24_000;

export type WarRoomBasis = "project" | "task" | "standalone";
export type WarRoomScope = "thread" | "room" | "all";

export interface WarRoomThreadModel {
  /** Tile id — pass to `war_room_read_thread` / `war_room_message_thread`. */
  id: string;
  title: string;
  /** The thread agent's conversation id (null when it has none yet). */
  conversationId: string | null;
  status?: string;
  taskId?: string | null;
  taskTitle?: string;
  taskStatus?: string;
  noteId?: string | null;
  noteChars?: number;
  noteSnippet?: string;
  hasAudio: boolean;
  fileCount: number;
}

export interface WarRoomRoomModel {
  id: string;
  title: string;
  description?: string | null;
  basis: WarRoomBasis;
  projectId?: string | null;
  projectName?: string;
  threads: WarRoomThreadModel[];
}

export interface WarRoomContextModel {
  scope: WarRoomScope;
  /** A line or two of framing — the "system-message-like" steer. */
  role: string;
  /** One line teaching which tools fetch the heavy details. */
  howTo: string;
  /** The room (thread + room scope). */
  room?: WarRoomRoomModel;
  /** Which thread is "this one" (thread scope only). */
  currentThreadId?: string;
  /** Every room (master scope only). */
  rooms?: WarRoomRoomModel[];
}

// ── XML helpers ───────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `key="value"` only when value is present — keeps the roster terse. */
function attr(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return ` ${name}="${esc(String(value))}"`;
}

function roomOpenTag(room: WarRoomRoomModel, selfClosing: boolean): string {
  const tag =
    "<room" +
    attr("id", room.id) +
    attr("name", room.title) +
    attr("basis", room.basis) +
    attr("project", room.projectName) +
    attr("project_id", room.projectId) +
    attr("threads", room.threads.length);
  return selfClosing ? `${tag}/>` : `${tag}>`;
}

/** One terse thread row for a roster (room / master scope). */
function threadRow(t: WarRoomThreadModel): string {
  return (
    "    <thread" +
    attr("id", t.id) +
    attr("title", t.title) +
    attr("conversation", t.conversationId) +
    attr("status", t.status) +
    attr("task", t.taskTitle) +
    attr("task_status", t.taskStatus) +
    attr("note_snippet", t.noteSnippet) +
    attr("audio", t.hasAudio ? "yes" : undefined) +
    attr("files", t.fileCount > 0 ? t.fileCount : undefined) +
    "/>"
  );
}

/** The detailed block for the thread an agent is actually working in. */
function currentThreadBlock(t: WarRoomThreadModel): string {
  const lines: string[] = [
    "  <current_thread" + attr("id", t.id) + attr("title", t.title) + ">",
  ];
  if (t.taskId) {
    lines.push(
      "    <task" +
        attr("id", t.taskId) +
        attr("status", t.taskStatus) +
        ">" +
        esc(t.taskTitle ?? "") +
        "</task>",
    );
  }
  if (t.noteId) {
    lines.push("    <note" + attr("id", t.noteId) + attr("chars", t.noteChars) + "/>");
  }
  if (t.hasAudio) {
    lines.push('    <audio transcript="ctx_get session_cleaned"/>');
  }
  if (t.fileCount > 0) {
    lines.push("    <files" + attr("count", t.fileCount) + "/>");
  }
  lines.push("  </current_thread>");
  return lines.join("\n");
}

/** Serialize the model to the concise `<war_room>` XML block. */
export function renderWarRoomXml(model: WarRoomContextModel): string {
  const lines: string[] = [`<war_room scope="${model.scope}">`];
  lines.push(`  <role>${esc(model.role)}</role>`);

  if (model.scope === "all") {
    const rooms = model.rooms ?? [];
    lines.push(`  <rooms count="${rooms.length}">`);
    for (const room of rooms) {
      if (room.threads.length === 0) {
        lines.push(`    ${roomOpenTag(room, true)}`);
        continue;
      }
      lines.push(`    ${roomOpenTag(room, false)}`);
      for (const t of room.threads) lines.push(`  ${threadRow(t)}`);
      lines.push("    </room>");
    }
    lines.push("  </rooms>");
  } else if (model.room) {
    const room = model.room;
    lines.push(`  ${roomOpenTag(room, true)}`);

    if (model.scope === "thread") {
      const current = room.threads.find((t) => t.id === model.currentThreadId);
      if (current) lines.push(currentThreadBlock(current));
      const others = room.threads.filter((t) => t.id !== model.currentThreadId);
      lines.push(`  <other_threads count="${others.length}">`);
      for (const t of others) lines.push(threadRow(t));
      lines.push("  </other_threads>");
    } else {
      lines.push(`  <threads count="${room.threads.length}">`);
      for (const t of room.threads) lines.push(threadRow(t));
      lines.push("  </threads>");
    }
  }

  lines.push(`  <how_to>${esc(model.howTo)}</how_to>`);
  lines.push("</war_room>");
  return lines.join("\n");
}

/**
 * Wrap the model as the single INLINE `war_room` context entry. Rich-form value
 * (dict with `content`) so the backend renders the XML verbatim into the prompt;
 * high `max_inline_chars` forces inline (no `ctx_get` round trip).
 */
export function buildWarRoomContextEntry(
  model: WarRoomContextModel,
): AssistantContextEntry {
  return {
    key: WAR_ROOM_CONTEXT_KEY,
    value: {
      content: renderWarRoomXml(model),
      type: "text",
      label: "War Room",
      description:
        "Where you are in the War Room and everything around you — the room, " +
        "its threads, their tasks/notes/audio/files, and each thread's agent " +
        "conversation id. Read it directly; fetch heavy bodies with tools.",
      max_inline_chars: INLINE_CEIL,
    },
    type: "text",
    label: "War Room",
  };
}
