// features/war-room/types.ts
//
// War Room domain types. Supabase-generated rows are the source of truth.

import type { Database, Json } from "@/types/database.types";

// ── Raw DB row aliases ────────────────────────────────────────────────
// War-room tables moved out of `public` into the dedicated `workspace` schema
// in the 2026 DB restructure: `wr_sessions`→`workspace.war_rooms`,
// `wr_threads`→`workspace.threads`. Reach them via `workspaceDb(supabase)`.
export type WarRoomSession =
  Database["workspace"]["Tables"]["war_rooms"]["Row"];
export type WarRoomSessionInsert =
  Database["workspace"]["Tables"]["war_rooms"]["Insert"];
export type WarRoomSessionUpdate =
  Database["workspace"]["Tables"]["war_rooms"]["Update"];

export type WarRoomThread = Database["workspace"]["Tables"]["threads"]["Row"];
export type WarRoomThreadInsert =
  Database["workspace"]["Tables"]["threads"]["Insert"];
export type WarRoomThreadUpdate =
  Database["workspace"]["Tables"]["threads"]["Update"];

/**
 * Canonical anchor vocabulary.
 * `canvas` — freeform resource hub; no anchor_id (the thread itself is the identity).
 * `task` / `project` — first tab binds to that entity via anchor_id.
 */
export type ThreadAnchorType = "canvas" | "project" | "task";

/**
 * One content edge feeding thread hydration (built in `service/readApi.ts`
 * from `assoc_for_targets` edges — the `thread_contents()` SQL function shape
 * plus the REAL edge fields so `is_active` / `position` / `canvas` / labels
 * survive a reload instead of being re-synthesized).
 */
export interface ThreadContentModule {
  module_type: string;
  module_id: string;
  origin: "thread" | "anchor";
  anchor_type: string;
  anchor_id: string;
  /** Edge label as stamped at attach time (titles for the resources UI). */
  label: string | null;
  /** The edge's raw jsonb metadata (is_active / position / canvas / pinned). */
  metadata: Json | null;
}

// ── Associations — reconstructed from `platform.associations` edges ───
export interface WarRoomAssignment {
  id: string;
  container_type: string;
  container_id: string;
  entity_type: string;
  entity_id: string;
  position: number | null;
  is_active: boolean | null;
  label: string | null;
  metadata: Json | null;
  created_by: string | null;
  created_at: string | null;
}

export type WarRoomContainerType = "room" | "thread";

// The war-room content vocabulary is OPEN: any registered `platform.entity_types`
// token can attach to a thread/room (the guard layer in `associationsService`
// validates tokens at the callsite). The only war-room-local mapping is the
// legacy `user_file ↔ file` alias, kept inside `service/associations.ts`.
// There is deliberately NO union type here — a closed union was the ceiling
// that made every newly registered entity type invisible.

export interface ContainerRef {
  type: WarRoomContainerType;
  id: string;
}

export function containerKey(type: WarRoomContainerType, id: string): string {
  return `${type}:${id}`;
}

export function threadRef(threadId: string): ContainerRef {
  return { type: "thread", id: threadId };
}

export function roomRef(roomId: string): ContainerRef {
  return { type: "room", id: roomId };
}

/**
 * Types where a container keeps ONE focused/"active" member (the tab shows the
 * active one; attaching another demotes it). Everything else is multi-attach.
 */
export const SINGLE_ACTIVE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  "task",
  "project",
  "note",
  "studio_session",
]);

/** Quick-add picker vocabulary (maps to thread anchor_type). */
export type ThreadPickerOption = "canvas" | "task" | "project";

// ── Thread tabs ───────────────────────────────────────────────────────
// Core tabs are the rich, purpose-built views. `entity:${token}` tabs are
// DERIVED — one appears automatically for every attached entity type the
// core tabs don't cover (dataset, flashcard_set, data_store, …), rendering
// the canonical AssociationList scoped to that token. `active_tab` is a
// plain text column, so no migration gates new values; every read goes
// through `normalizeThreadTab` (hooks/useThreadTabs.ts) to stay valid.
export type ThreadCoreTab =
  | "task"
  | "notes"
  | "audio"
  | "files"
  | "agent"
  | "combined";

export const THREAD_CORE_TABS: readonly ThreadCoreTab[] = [
  "task",
  "notes",
  "audio",
  "files",
  "agent",
  "combined",
];

export type ThreadTab = ThreadCoreTab | `entity:${string}`;

/** The token of an `entity:` tab, else null. */
export function entityTabToken(tab: string | null | undefined): string | null {
  return tab && tab.startsWith("entity:") ? tab.slice("entity:".length) : null;
}

/** Per-user pin/hide — lives in `platform.user_entity_state`, not on the row. */
export interface ThreadUserState {
  isPinned: boolean;
  isHidden: boolean;
}

// ── Resolved context (scopes via setEntityScopes — not row columns) ───
export interface ThreadContext {
  organizationId: string | null;
  scopeIds: string[];
  /** true when the thread has its own scope tags (not inheriting the room). */
  isOverridden: boolean;
}

// ── Create inputs (service layer) ─────────────────────────────────────
export interface CreateSessionInput {
  title?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  organizationId?: string | null;
  /** Creates a `war_room → project` association after insert. */
  projectId?: string | null;
}

export interface CreateThreadInput {
  /** When set, inserts a `thread → war_room` membership edge after create. */
  roomId?: string | null;
  anchorType?: ThreadAnchorType;
  anchorId?: string | null;
  /** Convenience — sets anchor to task. */
  taskId?: string | null;
  /** Convenience — sets anchor to project. */
  projectId?: string | null;
  activeTab?: ThreadTab;
  position?: number;
  title?: string | null;
}
