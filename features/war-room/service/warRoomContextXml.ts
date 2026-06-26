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

/**
 * One file/document attached to a thread, as the agent sees it in the inline
 * `<files>` manifest. `id` is the `cld_files.id` (file) / `udt_documents.id`
 * (document) — the handle `war_room_read_file(file_id=…)` (files) / the `document`
 * tool (documents) read by. `hasExtraction`/`ragIndexed` are best-effort: omitted
 * (undefined) when not yet known rather than guessed (see threadToModel).
 */
export interface WarRoomFileModel {
  /** cld_files.id (kind="file") or udt_documents.id (kind="document"). */
  id: string;
  name: string;
  mime?: string;
  kind: "file" | "document";
  /** True when OUR text extraction exists (readable server-side via the
   *  data_action read_file_extraction operation). */
  hasExtraction?: boolean;
  /** True when the file is indexed for RAG (searchable via rag_search). */
  ragIndexed?: boolean;
}

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
  /** Count of attached files/documents — the terse roster signal. */
  fileCount: number;
  /**
   * Per-file manifest for the thread an agent is working IN (current_thread
   * only). Populated by the Tier-1 builder (`threadToModel`); the async
   * Tier-2/3 builders leave it undefined and rely on `fileCount`.
   */
  files?: WarRoomFileModel[];
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

/**
 * One terse thread row for a room / master roster. Carries what an OVERSEER needs
 * to decide where to act — task + status + the conversation id to message it —
 * but NOT heavy bodies (no note snippet); those are fetched on demand. Keeps the
 * roster from ballooning as a room grows to dozens of threads (task 15e53057).
 */
function threadRow(t: WarRoomThreadModel): string {
  return (
    "    <thread" +
    attr("id", t.id) +
    attr("title", t.title) +
    attr("conversation", t.conversationId) +
    attr("status", t.status) +
    attr("task", t.taskTitle) +
    attr("task_status", t.taskStatus) +
    attr("audio", t.hasAudio ? "yes" : undefined) +
    attr("files", t.fileCount > 0 ? t.fileCount : undefined) +
    "/>"
  );
}

/**
 * The MINIMAL sibling row a single-thread agent sees about the OTHER threads in
 * its room: just enough to know they exist and their state (id + title + task
 * status). It reads a sibling's full chain on demand with war_room_read_thread.
 * Deliberately leaner than `threadRow` — a thread agent shouldn't carry the whole
 * room's detail in its window (task 15e53057).
 */
function siblingRow(t: WarRoomThreadModel): string {
  return (
    "    <thread" +
    attr("id", t.id) +
    attr("title", t.title) +
    attr("task_status", t.taskStatus ?? t.status) +
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
    // The ACTIVE recording's cleaned transcript is in your studio context as
    // `session_cleaned` when one exists; the reliable path for any/all of this
    // thread's recordings is the data tool (resource_type "studio_session") or
    // war_room_read_thread. Don't promise a key that may not have resolved yet.
    lines.push(
      '    <audio transcript_when_recording="session_cleaned" all_recordings="data: studio_session"/>',
    );
  }
  // Per-file manifest: each attachment with its id + extraction/RAG signals, so
  // the agent knows exactly what it can READ (data_action read_file_extraction)
  // and SEARCH (rag_search). Falls back to the bare count when the manifest isn't built.
  if (t.files && t.files.length > 0) {
    lines.push("    <files" + attr("count", t.files.length) + ">");
    for (const f of t.files) lines.push(fileRow(f));
    lines.push("    </files>");
  } else if (t.fileCount > 0) {
    lines.push("    <files" + attr("count", t.fileCount) + "/>");
  }
  lines.push("  </current_thread>");
  return lines.join("\n");
}

/**
 * One file row in a thread's `<files>` manifest. `extraction`/`rag` are emitted
 * only when known (a yes/no), so an unknown flag is simply absent rather than a
 * misleading "no". `read` names the exact tool for a readable file.
 */
function fileRow(f: WarRoomFileModel): string {
  return (
    "      <file" +
    attr("id", f.id) +
    attr("name", f.name) +
    attr("mime", f.mime) +
    attr("kind", f.kind) +
    attr(
      "extraction",
      f.hasExtraction === undefined ? undefined : f.hasExtraction ? "yes" : "no",
    ) +
    attr(
      "rag",
      f.ragIndexed === undefined
        ? undefined
        : f.ragIndexed
          ? "indexed"
          : "no",
    ) +
    attr(
      "read",
      f.kind === "document"
        ? "document tool"
        : f.hasExtraction === false
          ? undefined
          : "data_action read_file_extraction",
    ) +
    "/>"
  );
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
      for (const t of others) lines.push(siblingRow(t));
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
