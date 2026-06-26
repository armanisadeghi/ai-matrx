// features/war-room/types.ts
//
// War Room domain types. Supabase-generated rows are the source of truth.

import type { Database, Json } from "@/types/database.types";

// ── Raw DB row aliases ────────────────────────────────────────────────
export type WarRoomSession = Database["public"]["Tables"]["wr_sessions"]["Row"];
export type WarRoomSessionInsert =
  Database["public"]["Tables"]["wr_sessions"]["Insert"];
export type WarRoomSessionUpdate =
  Database["public"]["Tables"]["wr_sessions"]["Update"];

export type WarRoomThread = Database["public"]["Tables"]["wr_threads"]["Row"];
export type WarRoomThreadInsert =
  Database["public"]["Tables"]["wr_threads"]["Insert"];
export type WarRoomThreadUpdate =
  Database["public"]["Tables"]["wr_threads"]["Update"];

/**
 * Canonical anchor vocabulary.
 * `canvas` — freeform resource hub; no anchor_id (the thread itself is the identity).
 * `task` / `project` — first tab binds to that entity via anchor_id.
 */
export type ThreadAnchorType = "canvas" | "project" | "task";

/** One row from `thread_contents(thread_id)` — tab module hydration. */
export type ThreadContentModule =
  Database["public"]["Functions"]["thread_contents"]["Returns"][number];

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

export type WarRoomAssignmentEntityType =
  | "project"
  | "task"
  | "note"
  | "conversation"
  | "studio_session"
  | "user_file"
  | "document";

/** Entity types linkable from the Canvas tab (metadata.canvas on the edge). */
export const CANVAS_RESOURCE_ENTITY_TYPES = [
  "task",
  "project",
  "note",
  "user_file",
  "document",
] as const satisfies readonly WarRoomAssignmentEntityType[];

export type CanvasResourceEntityType =
  (typeof CANVAS_RESOURCE_ENTITY_TYPES)[number];

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

export const SINGLE_ACTIVE_ENTITY_TYPES: ReadonlySet<WarRoomAssignmentEntityType> =
  new Set(["task", "project", "note", "studio_session"]);

/** Quick-add flavor picker vocabulary (maps to thread anchor_type). */
export type ThreadPickerOption = "thread" | "task" | "project";

// ── Thread tabs ───────────────────────────────────────────────────────
export type ThreadTab =
  | "task"
  | "notes"
  | "audio"
  | "files"
  | "agent"
  | "combined";

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
