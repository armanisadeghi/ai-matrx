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
import { accessLegendEntries } from "@/features/scopes/registry/entityContentAdapters";

export const WAR_ROOM_CONTEXT_KEY = "war_room";
/** Generous ceiling — far below the backend HARD_INLINE_CAP (50 000) — so the
 *  overview renders inline even for a busy room/master roster. */
const INLINE_CEIL = 24_000;

/** Budget: max inline resource rows on the current thread (pinned first). */
const MAX_CURRENT_THREAD_RESOURCES = 60;
/** Budget: max inline PINNED rows per thread at room scope. */
const MAX_ROOM_PINNED_PER_THREAD = 3;
/** Budget: master shows pinned rows only when a room has at most this many. */
const MAX_MASTER_PINNED_PER_ROOM = 2;
/** Titles inside resource rows are clipped to keep the roster terse. */
const RESOURCE_TITLE_MAX = 60;

export type WarRoomBasis = "project" | "task" | "standalone";
export type WarRoomScope = "thread" | "room" | "all";

/**
 * One attached resource of ANY registered entity type, as agents see it in the
 * `<resources>` roster: the token + id (the tool handle), a human title, the
 * pinned flag (always-inline at every tier), and optional per-token attributes
 * (files carry mime/extraction/rag). Registry-open — new tokens flow through
 * with zero changes here.
 */
export interface WarRoomResourceModel {
  token: string;
  id: string;
  title: string;
  pinned?: boolean;
  /** Extra per-token attributes rendered onto the row (already terse). */
  attrs?: Record<string, string | number | undefined>;
}

/** Per-token attachment counts — the compact roster signal (`res=` attr). */
export interface WarRoomResourceCount {
  token: string;
  count: number;
}

/**
 * One file/document attached to a thread, as the agent sees it in the inline
 * `<files>` manifest. `id` is the `cld_files.id` (file) / `udt_documents.id`
 * (document) — the handle the server `file_read(file_id=…)` tool (files) / the
 * `document` tool (documents) read by. `hasExtraction`/`ragIndexed` are
 * best-effort: omitted (undefined) when not yet known rather than guessed (see
 * threadToModel).
 */
export interface WarRoomFileModel {
  /** cld_files.id (kind="file") or udt_documents.id (kind="document"). */
  id: string;
  name: string;
  mime?: string;
  kind: "file" | "document";
  /** True when OUR text extraction exists (readable server-side via the
   *  `file_read` tool / data_action read_file_extraction operation). */
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
  /**
   * EVERY attached resource (any registered entity type) for the thread an
   * agent works IN — the full `<resources>` roster. Tier-1 current thread
   * only; siblings/rosters carry `resourceCounts` (+ pinned rows).
   */
  resources?: WarRoomResourceModel[];
  /** Per-token counts — the `res="token:count …"` roster attribute. */
  resourceCounts?: WarRoomResourceCount[];
  /** Pinned resources — inline at EVERY tier (budgeted per scope). */
  pinnedResources?: WarRoomResourceModel[];
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

/** `res="task:1 note:2 data_store:1"` — the compact per-token counts attr. */
function resAttr(counts: WarRoomResourceCount[] | undefined): string {
  if (!counts || counts.length === 0) return "";
  const s = counts.map((c) => `${c.token}:${c.count}`).join(" ");
  return attr("res", s);
}

/** Aggregate counts across a room's threads (master roster signal). */
function roomResourceCounts(room: WarRoomRoomModel): WarRoomResourceCount[] {
  const totals = new Map<string, number>();
  for (const t of room.threads) {
    for (const c of t.resourceCounts ?? []) {
      totals.set(c.token, (totals.get(c.token) ?? 0) + c.count);
    }
  }
  return [...totals.entries()].map(([token, count]) => ({ token, count }));
}

function roomOpenTag(room: WarRoomRoomModel, selfClosing: boolean): string {
  const tag =
    "<room" +
    attr("id", room.id) +
    attr("name", room.title) +
    attr("basis", room.basis) +
    attr("project", room.projectName) +
    attr("project_id", room.projectId) +
    attr("threads", room.threads.length) +
    resAttr(roomResourceCounts(room));
  return selfClosing ? `${tag}/>` : `${tag}>`;
}

function clipTitle(title: string): string {
  return title.length > RESOURCE_TITLE_MAX
    ? `${title.slice(0, RESOURCE_TITLE_MAX - 1)}…`
    : title;
}

/** One `<res>` row — token + id (the tool handle) + title (+ file attrs). */
function resourceRow(r: WarRoomResourceModel, indent: string): string {
  let row =
    indent +
    "<res" +
    attr("type", r.token) +
    attr("id", r.id) +
    attr("title", clipTitle(r.title)) +
    attr("pin", r.pinned ? "1" : undefined);
  for (const [k, v] of Object.entries(r.attrs ?? {})) {
    row += attr(k, v);
  }
  return row + "/>";
}

/**
 * One terse thread row for a room / master roster. Carries what an OVERSEER needs
 * to decide where to act — task + status + the conversation id to message it —
 * but NOT heavy bodies (no note snippet); those are fetched on demand. Keeps the
 * roster from ballooning as a room grows to dozens of threads (task 15e53057).
 */
function threadRow(t: WarRoomThreadModel, maxPinned: number): string {
  const open =
    "    <thread" +
    attr("id", t.id) +
    attr("title", t.title) +
    attr("conversation", t.conversationId) +
    attr("status", t.status) +
    attr("task", t.taskTitle) +
    attr("task_status", t.taskStatus) +
    attr("audio", t.hasAudio ? "yes" : undefined) +
    resAttr(t.resourceCounts);
  const pinned = (t.pinnedResources ?? []).slice(0, maxPinned);
  if (pinned.length === 0) return `${open}/>`;
  const lines = [`${open}>`];
  for (const r of pinned) lines.push(resourceRow(r, "      "));
  lines.push("    </thread>");
  return lines.join("\n");
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
    attr("conversation", t.conversationId) +
    attr("task_status", t.taskStatus ?? t.status) +
    resAttr(t.resourceCounts) +
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
  // EVERY attached resource, any registered entity type — pinned first,
  // budgeted, with a `<more>` escape hatch naming the tool that lists the rest.
  // File rows carry their extraction/RAG signals as attrs (built upstream).
  if (t.resources && t.resources.length > 0) {
    const ordered = [...t.resources].sort(
      (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false),
    );
    const shown = ordered.slice(0, MAX_CURRENT_THREAD_RESOURCES);
    lines.push("    <resources" + attr("count", t.resources.length) + ">");
    for (const r of shown) lines.push(resourceRow(r, "      "));
    if (ordered.length > shown.length) {
      lines.push(
        "      <more" +
          attr("count", ordered.length - shown.length) +
          attr(
            "get",
            `war_room_read_resource(entity_type='thread', entity_id='${t.id}')`,
          ) +
          "/>",
      );
    }
    lines.push("    </resources>");
  } else if (t.fileCount > 0) {
    lines.push("    <files" + attr("count", t.fileCount) + "/>");
  }
  lines.push("  </current_thread>");
  return lines.join("\n");
}

/** Every token present anywhere in the model — drives the `<access>` legend. */
function collectTokens(model: WarRoomContextModel): Set<string> {
  const tokens = new Set<string>();
  const takeThread = (t: WarRoomThreadModel) => {
    for (const r of t.resources ?? []) tokens.add(r.token);
    for (const r of t.pinnedResources ?? []) tokens.add(r.token);
    for (const c of t.resourceCounts ?? []) tokens.add(c.token);
  };
  for (const t of model.room?.threads ?? []) takeThread(t);
  for (const room of model.rooms ?? []) {
    for (const t of room.threads) takeThread(t);
  }
  return tokens;
}

/**
 * The ONE `<access>` legend: how the agent reaches each attached type's
 * content. Rendered once (never per row — the roster stays terse) from the
 * canonical adapter registry, only for tokens actually present.
 */
function accessLegend(model: WarRoomContextModel): string | null {
  const entries = accessLegendEntries(collectTokens(model));
  if (entries.length === 0) return null;
  let line = "  <access";
  for (const e of entries) line += attr(e.token, e.hint);
  return line + "/>";
}

/** Total pinned rows across a room (master budget gate). */
function roomPinnedCount(room: WarRoomRoomModel): number {
  return room.threads.reduce(
    (n, t) => n + (t.pinnedResources?.length ?? 0),
    0,
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
      // Master roster: counts always; pinned rows only for quiet rooms.
      const maxPinned =
        roomPinnedCount(room) <= MAX_MASTER_PINNED_PER_ROOM
          ? MAX_MASTER_PINNED_PER_ROOM
          : 0;
      lines.push(`    ${roomOpenTag(room, false)}`);
      for (const t of room.threads) lines.push(`  ${threadRow(t, maxPinned)}`);
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
      for (const t of room.threads) {
        lines.push(threadRow(t, MAX_ROOM_PINNED_PER_THREAD));
      }
      lines.push("  </threads>");
    }
  }

  const legend = accessLegend(model);
  if (legend) lines.push(legend);
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
