/**
 * Surface manifest — War Room Thread (`matrx-user/war-room-thread`).
 *
 * The agent panel of ONE War Room thread (tile). It IS a real chat — the thread
 * agent's conversation drives the working document, scratchpad, and context rail
 * exactly like `matrx-user/chat`, which this surface parents to (the parent link
 * is set on the `ui_surface` row; the manifest sync only writes values + roles).
 * War-room-specific: the default Thread Agent and dictionary support
 * (terminology / pronunciation layered into the agent).
 *
 * The thread agent ID is hardcoded here (matching the `transcripts-cleanup`
 * pattern). AGENT ID vs AGENT SLOT: the thread agent's runtime default is the
 * `war_room.thread` AGENT SLOT (`WAR_ROOM_THREAD_AGENT_SLOT` in
 * `features/war-room/constants`) — that is what the War Room actually runs.
 * A manifest is STATIC module-scope data seeded into `ui_surface_agent_role`,
 * so it cannot resolve a slot; the id below is a SEED MIRROR of the slot's
 * system default, not a second authority.
 *
 * Runtime scope assembly lives in `features/war-room/lib/war-room-scope.ts`
 * (`buildWarRoomThreadScope`); the emitter is the `<SurfaceRuntimeProvider>`
 * inside `ThreadAgentPanel` — the thread's own agent surface, which nests
 * DEEPER than the room shell's provider so it wins while it is mounted.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { TASK_STATUSES } from "@/features/tasks/constants/status";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

// Seed mirror of the `war_room.thread` slot's system default (see the header).
const WAR_ROOM_THREAD_AGENT_ID = "3153a326-5e0c-4c31-841d-52e8c5e9c39c";

const groups: SurfaceValueGroup[] = [
  {
    key: "thread_identity",
    label: "Thread identity",
    sortOrder: 100,
    description:
      "Which thread this is, what it is anchored to, and which room it lives in.",
  },
  {
    key: "thread_work",
    label: "Thread work",
    sortOrder: 200,
    description:
      "The task and note the thread is currently working — the substrate behind its Task and Notes tabs.",
  },
  {
    key: "thread_audio",
    label: "Audio",
    sortOrder: 300,
    description:
      "The thread's recording sessions. Transcript bodies ride in the studio context, not here.",
  },
  {
    key: "thread_resources",
    label: "Thread resources",
    sortOrder: 400,
    description:
      "Everything attached to THIS thread via association edges — the open entity vocabulary behind the Resources tab.",
  },
  {
    key: "thread_agent",
    label: "Agent binding",
    sortOrder: 500,
    description:
      "The thread's own conversation and assistant agent — the chat the user is having inside this tile.",
  },
  {
    key: "room_context",
    label: "Surrounding room",
    sortOrder: 600,
    description:
      "The rest of the room around this thread, so the agent has the full picture without re-querying.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Thread identity ──────────────────────────────────────────────────
  {
    name: "thread_id",
    label: "Thread ID",
    description:
      "UUID of the War Room thread (tile) the agent is acting in. Always present — the panel is only mounted for a resolved thread.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "thread_identity",
  },
  {
    name: "thread_title",
    label: "Thread title",
    description:
      "The thread's own title. Empty when the user never named it — use `thread_anchor_label` for a readable fallback.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 305,
    group: "thread_identity",
  },
  {
    name: "thread_anchor",
    label: "Thread anchor",
    description:
      "The thread's singular primary subject as { type, id }: `task` / `project` with its id, or `canvas` (id null) for a free-form thread. Always emitted. Stored on the thread row, never as an association edge.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 310,
    group: "thread_identity",
  },
  {
    name: "thread_anchor_label",
    label: "Thread anchor label",
    description:
      "The thread's primary subject in words — the anchored task title, the project name, or \"canvas\" for a free-form thread. Always emitted; this is the human name for the thread.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 320,
    group: "thread_identity",
  },
  {
    name: "active_tab",
    label: "Active tab",
    description:
      'Which tab the thread is showing (`task` | `notes` | `audio` | `files` | `agent` | `all` | `entity:<token>`). Always emitted; unknown stored values normalize to `task`.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 330,
    group: "thread_identity",
  },
  {
    name: "thread_position",
    label: "Thread position",
    description:
      "The thread's ordering position within the room. Always emitted; zero-based and not necessarily contiguous.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 340,
    group: "thread_identity",
    autoContext: false,
  },
  {
    name: "is_pinned",
    label: "Pinned",
    description:
      "True when the user has pinned this thread to the front of the room. Always emitted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "thread_identity",
    autoContext: false,
  },
  {
    name: "thread_organization_id",
    label: "Thread organization ID",
    description:
      "UUID of the organization that owns the thread row (RLS basis). Always emitted while the thread is loaded.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 360,
    group: "thread_identity",
    autoContext: false,
  },
  {
    name: "room_id",
    label: "Room ID",
    description:
      "UUID of the War Room this thread belongs to. Empty only in the transient case where the thread is rendered before its room is resolved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 365,
    group: "thread_identity",
  },
  {
    name: "room_name",
    label: "Room name",
    description:
      "Title of the War Room (session) the active thread belongs to. Empty when the room row is not hydrated.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 370,
    group: "thread_identity",
  },
  {
    name: "project_id",
    label: "Effective project ID",
    description:
      "UUID of the project governing this thread — its own project anchor if it has one, otherwise the room's project. Empty when neither is set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 375,
    group: "thread_identity",
  },
  {
    name: "project_name",
    label: "Effective project name",
    description:
      "Name of the effective project for this thread. Empty when there is no project or the project row is not hydrated.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 380,
    group: "thread_identity",
  },

  // ── Thread work ──────────────────────────────────────────────────────
  {
    name: "task_id",
    label: "Task ID",
    description:
      "UUID of the task this thread is working (its anchor task, else the active `task` edge). Empty for a canvas thread with no task.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "thread_work",
  },
  {
    name: "task_title",
    label: "Task title",
    description:
      "Title of the thread's task. Empty when there is no task or the task row is not hydrated yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 410,
    group: "thread_work",
  },
  {
    name: "task_status",
    label: "Task status",
    description:
      "Status of the thread's task (e.g. todo / in_progress / done). Empty when there is no task.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 420,
    group: "thread_work",
  },
  {
    name: "subtask_count",
    label: "Subtask count",
    description:
      "How many subtasks the thread's task has, as hydrated by the panel. Zero when there is no task or it has none. Always emitted.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 430,
    group: "thread_work",
  },
  {
    name: "note_id",
    label: "Note ID",
    description:
      "UUID of the thread's active note (the one the Notes tab shows). Empty when no note is attached.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 440,
    group: "thread_work",
  },
  {
    name: "note_title",
    label: "Note title",
    description:
      "Label of the thread's active note. Empty when no note is attached or it is unnamed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 450,
    group: "thread_work",
  },
  {
    name: "note_content",
    label: "Note content",
    description:
      "Markdown body of the thread's active note as hydrated in the client. Empty when no note is attached or it is blank. This is a full body — bind deliberately.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 460,
    group: "thread_work",
  },

  // ── Audio ────────────────────────────────────────────────────────────
  {
    name: "audio_session_ids",
    label: "Audio session IDs",
    description:
      "UUIDs of every recording session attached to this thread, in attachment order. Empty array when the thread has never recorded. Always emitted.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 500,
    group: "thread_audio",
  },
  {
    name: "active_audio_session_id",
    label: "Active audio session",
    description:
      "UUID of the thread's active recording session — the one the Audio tab records into and the agent panel binds to. Empty when the thread has no audio session.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 510,
    group: "thread_audio",
  },
  {
    name: "has_audio",
    label: "Has audio",
    description:
      "True when at least one recording session is attached to this thread. Always emitted. Transcript bodies arrive through the studio context (`session_cleaned` / `session_NN_*`), not this surface.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 520,
    group: "thread_audio",
  },

  // ── Thread resources ─────────────────────────────────────────────────
  {
    name: "thread_resources",
    label: "Thread resources",
    description:
      "Everything attached to THIS thread via association edges, any registered entity type (files, documents, notes, data stores, datasets…): per row its entity token, id, label, and pinned flag. Empty array when nothing is attached.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1200,
    sortOrder: 600,
    group: "thread_resources",
  },
  {
    name: "thread_resource_counts",
    label: "Thread resource counts",
    description:
      "Per-entity-token counts of everything attached to the thread ([{ token, count }]). Empty array when nothing is attached. Always emitted.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 610,
    group: "thread_resources",
  },
  {
    name: "attached_file_ids",
    label: "Attached file IDs",
    description:
      "Ids of the files and editable documents attached to this thread (the Resources tab's file rows). Empty array when none. Always emitted. Read their bodies with the file/document tools — never assume content from an id.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 620,
    group: "thread_resources",
    autoContext: false,
  },
  {
    name: "pinned_resource_ids",
    label: "Pinned resource IDs",
    description:
      "Ids of the thread's PINNED resources — the user's must-use material. Empty array when nothing is pinned. Always emitted.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 630,
    group: "thread_resources",
  },

  // ── Agent binding ────────────────────────────────────────────────────
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the thread's active agent conversation — the chat inside this tile. Empty until a conversation has been started for the thread.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 700,
    group: "thread_agent",
  },
  {
    name: "assistant_agent_id",
    label: "Assistant agent ID",
    description:
      "UUID of the agent currently bound to this thread's assistant panel (defaults to the platform Thread Agent). Empty when the panel has not resolved an agent yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 710,
    group: "thread_agent",
    autoContext: false,
  },

  // ── Surrounding room ─────────────────────────────────────────────────
  {
    name: "room_thread_count",
    label: "Room thread count",
    description:
      "How many threads the surrounding room has in total. Always emitted; 1 when this is the only thread.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 800,
    group: "room_context",
  },
  {
    name: "sibling_threads",
    label: "Sibling threads",
    description:
      "The OTHER threads in the same room: per thread its id, title, anchor type, and task title. Empty array when this is the only thread. Read a sibling's chain with war_room_read_thread(thread_id) — this is an index, not their content.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    sortOrder: 810,
    group: "room_context",
  },
];

/**
 * WRITE half — what a thread agent may author on the thread it is sitting in.
 *
 * A War Room thread bundles four different kinds of state, and only two of them
 * are things a person AUTHORS. The split below is deliberate:
 *
 * 1. The anchored NOTE body and the anchored TASK's title/status are authored
 *    work — prose the agent can draft better and faster than the user retyping
 *    it, and a planning field derivable from what the thread has established.
 *    Those earn targets. They stage through the SAME dispatches the user's own
 *    controls fire (`updateNoteContent` from `ThreadNotesTab`'s editor
 *    `onChange`; `updateTaskFieldThunk` from `ThreadTaskTab`), so an agent
 *    write is indistinguishable from typing — autosaved, undoable, one path.
 *
 * 2. RECORDING is a NO. Starting or stopping a thread recording spends real
 *    time and captures a live human conversation; the settled campaign
 *    precedent for anything that spends time or budget (`podcast-studio`,
 *    `image-generate`, `marketing-crawls`) is that the human press stays the
 *    gate. Stated here explicitly rather than by omission.
 *
 * 3. TRANSCRIPTS and the CONVERSATION are evidence, not input. `audio_session_*`
 *    and `conversation_id` describe what was already said; rewriting them would
 *    edit the record of a meeting. Same rule as `processed_data`/`ast` on
 *    `markdown-editor` — results are read-only to the thing that produced them.
 *
 * 4. Thread TITLE is deliberately absent. It is already agent-writable one
 *    level up, as `active_thread_title` on `matrx-user/war-room` (the room
 *    shell's `renameThread` handler). Declaring it again here would be a second
 *    write path into the same row — exactly what the handler doctrine forbids.
 *
 * Also excluded as identity / mechanical: `thread_organization_id`, `room_id`,
 * `project_id`, `thread_position`, `is_pinned`, `active_tab`, and the resource
 * attachment sets (`attached_file_ids`, `pinned_resource_ids`).
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "thread_note_content",
    label: "Thread note content",
    description:
      "REPLACES the entire body of the note anchored to THIS thread with the value — markdown text, exactly as it should read. Use for rewrites, cleanups, restructures, and for writing up what the thread has worked out; read the current body from `note_content` first so nothing the user wants kept is dropped. To add to the note instead of replacing it, use `append_to_thread_note`. Staged into the live note editor (undoable, autosaved exactly like the user's own typing). Refused when the thread has no note yet — ask the user to add one from the thread's Notes tab.",
    valueType: "string",
    updatesValue: "note_content",
    mode: "draft",
    applyPolicy: "ask",
    group: "thread_work",
    sortOrder: 100,
  },
  {
    name: "append_to_thread_note",
    label: "Appended thread note content",
    description:
      "APPENDS the value to the end of this thread's note, separated by a blank line. Nothing already in the note is changed or removed — pass ONLY the new markdown to add (do not repeat the existing body). Use for adding a summary, a decision, or action items to what the user already wrote. Staged into the live note editor (undoable, autosaved like the user's own typing). Refused when the thread has no note yet.",
    valueType: "string",
    updatesValue: "note_content",
    mode: "draft",
    applyPolicy: "ask",
    group: "thread_work",
    sortOrder: 110,
  },
  {
    name: "thread_task_title",
    label: "Thread task title",
    description:
      "Sets the title of the task anchored to THIS thread. A non-empty single-line plain string — no markdown, no surrounding quotes, no trailing punctuation. Use it to sharpen a vague task into what the thread has actually established the work is. Saved immediately through the canonical task update path. Refused when the thread is not anchored to a task.",
    valueType: "string",
    updatesValue: "task_title",
    mode: "entity",
    applyPolicy: "ask",
    group: "thread_work",
    sortOrder: 120,
  },
  {
    name: "thread_task_status",
    label: "Thread task status",
    description: `Sets the lifecycle status of the task anchored to THIS thread. Exactly one of: ${TASK_STATUSES.join(" | ")}. Lifecycle runs inbox → planned → active → completed, with cancelled and dismissed as terminal side-exits. Only move it where the thread's own evidence supports it — do not mark work completed that the user has not said is done. Saved immediately through the canonical task update path. Refused when the thread is not anchored to a task.`,
    valueType: "string",
    updatesValue: "task_status",
    mode: "entity",
    applyPolicy: "ask",
    group: "thread_work",
    sortOrder: 130,
  },
];

export const warRoomThreadManifest: SurfaceManifest = {
  surfaceName: "matrx-user/war-room-thread",
  readiness: "verified",
  label: "War Room Thread",
  urlPattern: "/war-room/[id]",
  intro: `<surface_intro>
You are the agent for ONE thread inside a War Room — a single lane of the user's work, bundling a task, notes, recordings, attached resources, and this chat.
thread_anchor / thread_anchor_label are what the thread is ABOUT (a task, a project, or a free-form canvas). task_* and note_* are the work in front of the user; active_tab says which of them they are looking at right now.
thread_resources is the complete list of what the user attached to this thread — any entity type. Treat it as an index: read a body with the appropriate tool (file/document/data reads, knowledge_search for a data store) rather than guessing. pinned_resource_ids are the user's must-use material.
Recordings: has_audio / audio_session_ids tell you they exist; the transcripts themselves arrive in your studio context (session_cleaned, session_NN_cleaned / session_NN_raw). Never report a recording as missing without checking those.
sibling_threads is the rest of the room for orientation only — work the thread you are in, and read another thread's chain with war_room_read_thread(thread_id) if you truly need it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "thread",
      label: "Thread agent",
      description:
        "The dedicated agent for one War Room thread — reads the thread's attached notes / tasks / files SERVER-SIDE, edits the working document and scratchpad in place, and helps the user in this thread.",
      kind: "single",
      defaultAgentId: WAR_ROOM_THREAD_AGENT_ID,
      allowCustom: true,
      autoRun: "never",
      sortOrder: 10,
    },
  ],
  configNamespaces: [
    {
      namespace: "dictionary",
      label: "Dictionary",
      description:
        "Custom terminology + pronunciations layered into the thread agent (org + user).",
    },
  ],
};

/** One attached row as emitted in `thread_resources`. */
export interface WarRoomThreadResourceEntry {
  token: string;
  id: string;
  title: string;
  pinned: boolean;
}

/** One sibling as emitted in `sibling_threads`. */
export interface WarRoomSiblingThreadEntry {
  id: string;
  title: string;
  anchor_type: string;
  task_title?: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createWarRoomThreadScope(values: {
  // alwaysAvailable: true → required
  thread_id: string;
  thread_anchor: { type: string; id: string | null };
  thread_anchor_label: string;
  active_tab: string;
  thread_position: number;
  is_pinned: boolean;
  thread_organization_id: string;
  subtask_count: number;
  audio_session_ids: string[];
  has_audio: boolean;
  thread_resources: WarRoomThreadResourceEntry[];
  thread_resource_counts: Array<{ token: string; count: number }>;
  attached_file_ids: string[];
  pinned_resource_ids: string[];
  room_thread_count: number;
  sibling_threads: WarRoomSiblingThreadEntry[];
  // alwaysAvailable: false → optional
  thread_title?: string;
  room_id?: string;
  room_name?: string;
  project_id?: string;
  project_name?: string;
  task_id?: string;
  task_title?: string;
  task_status?: string;
  note_id?: string;
  note_title?: string;
  note_content?: string;
  active_audio_session_id?: string;
  conversation_id?: string;
  assistant_agent_id?: string;
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
