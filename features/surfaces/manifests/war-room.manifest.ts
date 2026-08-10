/**
 * Surface manifest — War Room (`matrx-user/war-room`).
 *
 * The room-level agent — spans every thread in one War Room (session), aware of
 * all of its threads and their attached resources, helping the user across the
 * whole room. Like the thread surface it is a real chat (parents to
 * `matrx-user/chat` via the `ui_surface` row) with dictionary support.
 *
 * AGENT ID vs AGENT SLOT: the room agent's runtime default is the
 * `war_room.room` AGENT SLOT (`WAR_ROOM_ROOM_AGENT_SLOT` in
 * `features/war-room/constants`) — that is what the War Room actually runs.
 * A manifest is STATIC module-scope data seeded into `ui_surface_agent_role`,
 * so it cannot resolve a slot; the id below is a SEED MIRROR of the slot's
 * system default, not a second authority. Repinning the slot does not require
 * touching it, and nothing in War Room reads it at run time.
 *
 * Runtime scope assembly lives in `features/war-room/lib/war-room-scope.ts`
 * (`buildWarRoomRoomScope`); the emitter is the `<SurfaceRuntimeProvider>` in
 * `WarRoomShell`, which owns the room's session state and view state.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

// Seed mirror of the `war_room.room` slot's system default (see the header).
const WAR_ROOM_ROOM_AGENT_ID = "7239e128-2a07-4d68-8292-0f530be6f754";

const groups: SurfaceValueGroup[] = [
  {
    key: "room_identity",
    label: "Room identity",
    sortOrder: 100,
    description:
      "Which War Room this is, its branding, and the singular subject (anchor / project) it is about.",
  },
  {
    key: "room_threads",
    label: "Threads",
    sortOrder: 200,
    description:
      "Every thread in the room — the roster the room agent reasons across — plus which one is staged, pinned, or parked.",
  },
  {
    key: "room_resources",
    label: "Room resources",
    sortOrder: 300,
    description:
      "Everything attached to the ROOM container itself (association edges), as opposed to a single thread.",
  },
  {
    key: "room_view",
    label: "Cockpit view",
    sortOrder: 400,
    description:
      "How the user is currently looking at the room: Stage vs Grid, the instrument projector, the density dial, live recording.",
  },
  {
    key: "working_context",
    label: "Working context",
    sortOrder: 500,
    description:
      "The user's globally-active context selections (the header context chip) while working in this room.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Room identity ────────────────────────────────────────────────────
  {
    name: "room_id",
    label: "Room ID",
    description:
      "UUID of the War Room (session) the agent is acting in. Always present — the `/war-room/[id]` route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "room_identity",
  },
  {
    name: "room_name",
    label: "Room name",
    description:
      "Title of the War Room. Always emitted; falls back to \"Untitled War Room\" when the user has not named it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 310,
    group: "room_identity",
  },
  {
    name: "room_description",
    label: "Room description",
    description:
      "The room's free-text description as stored on the `workspace.war_rooms` row. Empty when the user never wrote one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 315,
    group: "room_identity",
  },
  {
    name: "room_identity",
    label: "Room branding",
    description:
      "The room's chosen visual identity as { icon, color } — the icon key and color key rendered in the header. Empty object when the user kept the defaults. Cosmetic: bindable, not auto-context.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 50,
    sortOrder: 320,
    group: "room_identity",
    autoContext: false,
  },
  {
    name: "room_anchor",
    label: "Room anchor",
    description:
      "The room's singular primary subject as { type, id } — `project` with the project id, or `canvas` for a free-form room. Always emitted; `id` is null for canvas rooms. Never an association edge.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 330,
    group: "room_identity",
  },
  {
    name: "room_project_id",
    label: "Room project ID",
    description:
      "UUID of the project associated with the room (the active `project` edge on the room container). Empty when the room is standalone.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
    group: "room_identity",
  },
  {
    name: "room_project_name",
    label: "Room project name",
    description:
      "Name of the room's associated project. Empty when the room is standalone or the project row is not hydrated yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 350,
    group: "room_identity",
  },
  {
    name: "room_project_mode",
    label: "Project mode",
    description:
      '"room" when one project covers the whole room, "per-thread" when individual threads carry their own projects, "none" when no project is involved. Always emitted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 355,
    group: "room_identity",
  },
  {
    name: "room_organization_id",
    label: "Room organization ID",
    description:
      "UUID of the organization that owns the room row (RLS basis). Always emitted while the room is loaded.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 360,
    group: "room_identity",
    autoContext: false,
  },

  // ── Threads ──────────────────────────────────────────────────────────
  {
    name: "thread_count",
    label: "Thread count",
    description:
      "Total number of threads in this room, parked ones included. Zero for an empty room. Always emitted.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 400,
    group: "room_threads",
  },
  {
    name: "threads",
    label: "Thread roster",
    description:
      "Every thread in the room, ordered as the cockpit shows them (pinned first, then position): per thread its id, title, anchor { type, id }, active task id/title, active tab, pinned/parked flags, whether it has audio, its agent conversation id, and per-token resource counts. Empty array for an empty room. This is the room agent's map — bodies come from tools.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    sortOrder: 410,
    group: "room_threads",
  },
  {
    name: "active_thread_id",
    label: "Staged thread ID",
    description:
      "UUID of the thread currently on the Stage (or the one the room row remembers as last-focused). Empty when the room has no visible thread.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 420,
    group: "room_threads",
  },
  {
    name: "active_thread_title",
    label: "Staged thread title",
    description:
      "Title of the staged thread (its own title, else its anchored task's title). Empty when no thread is staged.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 430,
    group: "room_threads",
  },
  {
    name: "visible_thread_ids",
    label: "Visible thread IDs",
    description:
      "Thread UUIDs currently on screen (not parked), in cockpit order. Empty array when every thread is parked. Always emitted.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 440,
    group: "room_threads",
    autoContext: false,
  },
  {
    name: "parked_thread_ids",
    label: "Parked thread IDs",
    description:
      "Thread UUIDs the user has parked (hidden from the cockpit but still in the room). Empty array when none are parked. Always emitted.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 150,
    sortOrder: 450,
    group: "room_threads",
    autoContext: false,
  },
  {
    name: "pinned_thread_count",
    label: "Pinned thread count",
    description:
      "How many visible threads the user has pinned to the front of the room. Zero when none. Always emitted.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 460,
    group: "room_threads",
  },

  // ── Room resources ───────────────────────────────────────────────────
  {
    name: "room_resources",
    label: "Room resources",
    description:
      "Everything attached to the ROOM container via association edges (files, documents, notes, data stores, …): per row its entity token, id, label, and pinned flag. Empty array when nothing is attached to the room itself.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    sortOrder: 500,
    group: "room_resources",
  },
  {
    name: "room_resource_counts",
    label: "Room resource counts",
    description:
      "Per-entity-token counts of what is attached to the room container ([{ token, count }]). Empty array when nothing is attached. Always emitted.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 510,
    group: "room_resources",
  },

  // ── Cockpit view ─────────────────────────────────────────────────────
  {
    name: "view_mode",
    label: "View mode",
    description:
      '"stage" (watchlist rail + one driven thread) or "grid" (the bento gallery of every thread). Always emitted — it is ephemeral view state, never persisted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 600,
    group: "room_view",
    autoContext: false,
  },
  {
    name: "projected_tab",
    label: "Projected tab",
    description:
      "The tab the instrument projector is forcing on every thread (e.g. `notes`). Empty when each thread shows its own tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 610,
    group: "room_view",
    autoContext: false,
  },
  {
    name: "density",
    label: "Density",
    description:
      '"comfortable" or "compact" — the density dial that drives the gallery floors. Always emitted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 620,
    group: "room_view",
    autoContext: false,
  },
  {
    name: "is_recording",
    label: "Recording in progress",
    description:
      "True while a recording is in flight in this room — the room-level recording controller owns one recording at a time, for whichever thread started it. False otherwise. Always emitted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 630,
    group: "room_view",
  },

  // ── Working context ──────────────────────────────────────────────────
  {
    name: "active_scope_ids",
    label: "Active scope IDs",
    description:
      "Scope UUIDs the user has selected as globally-active working context (the header context chip) while in this room. Empty array when none are selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 360,
    sortOrder: 700,
    group: "working_context",
  },
];

/**
 * Write half of the 360 loop — what an agent may WRITE into the mounted War
 * Room. Handlers are registered by `WarRoomShell`'s SurfaceRuntimeProvider
 * (`useWarRoomWriteHandlers`) and run the SAME thunks the user's own controls
 * dispatch: `updateRoomIdentity` (the RoomIdentityButton popover),
 * `renameThread` (`useThreadActions.rename`), and `createThread` (QuickAdd).
 *
 * WHY THESE FOUR — the judgment bar:
 *  • `room_name` / `room_description` are authored copy. A room accumulates
 *    threads faster than its owner renames it; "read my six threads and name
 *    this room / write me a description" is the canonical agent job, and both
 *    have exact 1:1 read twins (`room_name`, `room_description`) so the agent
 *    can read before it replaces.
 *  • `active_thread_title` is the same authored-label class one level down,
 *    with a clean read twin (`active_thread_title`). Naming the thread you are
 *    standing in is a thing a user actually asks for.
 *  • `add_threads` is DECOMPOSITION — the `add_subtasks` shape from the tasks
 *    surface. Breaking a room's subject into parallel workstreams is exactly
 *    what the room agent is positioned to do, and it lands through the same
 *    `createThread` thunk (canvas anchor, appended position, default note /
 *    audio / conversation provisioning) that QuickAddThread uses.
 *
 * DELIBERATELY EXCLUDED: `room_id` / `room_project_id` / `room_organization_id`
 * (identity + ownership + the RLS basis — never an agent's call);
 * `room_resources` and the assignment edges (association plumbing, not authored
 * content); `is_recording` (a live hardware capture); thread deletion, parking,
 * pinning and hiding (destructive or purely the user's filing preference); and
 * `view_mode` / `density` / `projected_tab` (mechanical view toggles nobody
 * would ask an agent to flip).
 *
 * MODE — every target is `mode: "entity"`, because the War Room has NO staging
 * buffer: the identity popover and the thread-title input both persist on
 * commit through the thunks above, so a "draft" target would have no editor
 * state to stage into and no read twin that reflected it. Every target is
 * therefore `applyPolicy: "ask"` — the confirm dialog IS the review step that a
 * draft mode would otherwise provide.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "room_name",
    label: "Room name",
    description:
      "Renames this War Room immediately through the same save the room's identity popover uses (persisted, no separate save step). Value: a non-empty plain-text title string, no markdown. Replaces the current name — read room_name first if you mean to refine it.",
    valueType: "string",
    updatesValue: "room_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "room_identity",
    sortOrder: 100,
  },
  {
    name: "room_description",
    label: "Room description",
    description:
      "Writes the room's free-text description immediately through the same save the room's identity popover uses (persisted, no separate save step). Value: a plain-text string (a short paragraph — what this room is for), or an empty string to clear it. Replaces the FULL description — read room_description first and include anything you want kept.",
    valueType: "string",
    updatesValue: "room_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "room_identity",
    sortOrder: 110,
  },
  {
    name: "active_thread_title",
    label: "Staged thread title",
    description:
      "Retitles the thread currently on the Stage (the one active_thread_id names) immediately through the same rename the thread header uses (persisted, no separate save step). Value: a non-empty plain-text title string. Refused when the room has no staged thread — stage one first. Only ever touches the staged thread; to retitle a different one, ask the user to stage it.",
    valueType: "string",
    updatesValue: "active_thread_title",
    mode: "entity",
    applyPolicy: "ask",
    group: "room_threads",
    sortOrder: 200,
  },
  {
    name: "add_threads",
    label: "Add threads",
    description:
      "Creates new threads in this room immediately through the canonical create path (canvas-anchored, appended after the existing threads, each provisioned with its default note / audio / conversation) — the same thing the room's Add-thread card does. Value: a non-empty array of thread title strings, in the order they should appear. Appends only — it never renames or removes an existing thread.",
    valueType: "array",
    mode: "entity",
    applyPolicy: "ask",
    group: "room_threads",
    sortOrder: 210,
  },
];

export const warRoomManifest: SurfaceManifest = {
  surfaceName: "matrx-user/war-room",
  readiness: "verified",
  label: "War Room",
  urlPattern: "/war-room/[id]",
  intro: `<surface_intro>
You are the agent for ONE War Room — a saved cockpit of threads the user works in parallel. Your job is to reason ACROSS its threads: find, compare, prioritize, summarize, and delegate.
room_id / room_name / room_anchor tell you which room you are in and what it is about (a project, or a free-form canvas room). room_project_id / room_project_mode say whether one project covers the whole room or each thread carries its own.
threads is your map: every thread with its title, anchor, active task, tabs, pinned/parked standing, agent conversation id, and per-type resource counts. It is an INDEX, not the bodies — pull a thread's chain or a resource with your tools rather than assuming content. active_thread_id is the one the user is driving right now.
room_resources is what the user attached to the ROOM itself (as opposed to a single thread); per-thread attachments live on the thread surface.
The cockpit view values (view_mode, projected_tab, density) describe how the user is looking at the room — useful for phrasing, never a constraint on what you may reason about.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "room",
      label: "Room agent",
      description:
        "The room-spanning agent for a whole War Room — aware of every thread and its attachments, helping the user reason across the room.",
      kind: "single",
      defaultAgentId: WAR_ROOM_ROOM_AGENT_ID,
      allowCustom: true,
      autoRun: "never",
      sortOrder: 10,
    },
  ],
  writeTargets,
  configNamespaces: [
    {
      namespace: "dictionary",
      label: "Dictionary",
      description:
        "Custom terminology + pronunciations layered into the room agent (org + user).",
    },
  ],
};

/** One thread row as emitted in the `threads` roster value. */
export interface WarRoomThreadRosterEntry {
  id: string;
  title: string;
  anchor: { type: string; id: string | null };
  task_id: string | null;
  task_title?: string;
  active_tab: string;
  position: number;
  pinned: boolean;
  parked: boolean;
  has_audio: boolean;
  conversation_id: string | null;
  resource_counts: Array<{ token: string; count: number }>;
}

/** One attached row as emitted in `room_resources`. */
export interface WarRoomResourceEntry {
  token: string;
  id: string;
  title: string;
  pinned: boolean;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createWarRoomScope(values: {
  // alwaysAvailable: true → required
  room_id: string;
  room_name: string;
  room_anchor: { type: string; id: string | null };
  room_project_mode: string;
  room_organization_id: string;
  thread_count: number;
  threads: WarRoomThreadRosterEntry[];
  visible_thread_ids: string[];
  parked_thread_ids: string[];
  pinned_thread_count: number;
  room_resources: WarRoomResourceEntry[];
  room_resource_counts: Array<{ token: string; count: number }>;
  view_mode: string;
  density: string;
  is_recording: boolean;
  // alwaysAvailable: false → optional
  room_description?: string;
  room_identity?: { icon?: string; color?: string };
  room_project_id?: string;
  room_project_name?: string;
  active_thread_id?: string;
  active_thread_title?: string;
  projected_tab?: string;
  active_scope_ids?: string[];
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown> | string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
