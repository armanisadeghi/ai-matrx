// features/war-room/types.ts
//
// War Room domain types. Supabase-generated rows are the source of truth — we
// alias them directly (snake_case) rather than maintaining a parallel mapped
// shape. See features/war-room/FEATURE.md.

import type { Database, Json } from "@/types/database.types";

// ── Raw DB row aliases ────────────────────────────────────────────────
export type WarRoomSession =
  Database["public"]["Tables"]["ctx_war_room_sessions"]["Row"];
export type WarRoomSessionInsert =
  Database["public"]["Tables"]["ctx_war_room_sessions"]["Insert"];
export type WarRoomSessionUpdate =
  Database["public"]["Tables"]["ctx_war_room_sessions"]["Update"];

export type WarRoomTile =
  Database["public"]["Tables"]["ctx_war_room_tiles"]["Row"];
export type WarRoomTileInsert =
  Database["public"]["Tables"]["ctx_war_room_tiles"]["Insert"];
export type WarRoomTileUpdate =
  Database["public"]["Tables"]["ctx_war_room_tiles"]["Update"];

// ── Associations — the unified `platform.associations` model ───────────
// War-room relationships are EDGES in `platform.associations`, reconstructed
// into this shape by service/associations.ts. This is NOT a table row: the old
// per-type link tables (ctx_war_room_tile_audio_sessions/_notes/_attachments)
// and the transitional `ctx_war_room_assignments` table are being dropped. A
// container (room = session, thread = tile) holds ANY resource type, M2M; the
// Redux bucket `assignmentsByContainer` is keyed by container, and selectors +
// reducers read exactly the fields below.

/** A war-room association, reconstructed from a `platform.associations` edge. */
export interface WarRoomAssignment {
  id: string;
  /** The container vocabulary: 'room' | 'thread'. */
  container_type: string;
  container_id: string;
  /** The held resource type (war-room vocabulary: 'note' | 'task' | 'project' |
   *  'conversation' | 'studio_session' | 'user_file' | 'document'). */
  entity_type: string;
  entity_id: string;
  /** Gallery order within its type — carried in the edge metadata. */
  position: number | null;
  /** The focused member of a single-active type — carried in the edge metadata. */
  is_active: boolean | null;
  label: string | null;
  metadata: Json | null;
  /** Not carried on the edge (the RPC owns created_by); present for shape parity, read nowhere. */
  user_id: string | null;
  created_by: string | null;
  created_at: string | null;
}

/** A container that can hold resources: a whole room, or one thread (tile). */
export type WarRoomContainerType = "room" | "thread";

/** Every resource type a War Room container can hold. */
export type WarRoomAssignmentEntityType =
  | "project"
  | "task"
  | "note"
  | "conversation"
  | "studio_session"
  | "user_file"
  | "document";

/** A typed reference to a container (room or thread). */
export interface ContainerRef {
  type: WarRoomContainerType;
  id: string;
}

/** Stable Redux key for a container's assignment bucket. */
export function containerKey(type: WarRoomContainerType, id: string): string {
  return `${type}:${id}`;
}
export function threadRef(tileId: string): ContainerRef {
  return { type: "thread", id: tileId };
}
export function roomRef(sessionId: string): ContainerRef {
  return { type: "room", id: sessionId };
}

/**
 * Entity types that have a single "active/focused" member per container (setting
 * one demotes the others of the same type). The rest (files, documents,
 * conversations) coexist with no focus. Attachments are always is_active=true.
 */
export const SINGLE_ACTIVE_ENTITY_TYPES: ReadonlySet<WarRoomAssignmentEntityType> =
  new Set(["task", "project", "note", "studio_session"]);

// ── Tile tabs ─────────────────────────────────────────────────────────
export type TileTab =
  | "task"
  | "notes"
  | "audio"
  | "files"
  | "agent"
  | "combined";

// ── Tile flavor ───────────────────────────────────────────────────────
// What a tile primarily REPRESENTS (its render/intent discriminator):
//   • thread  — the generic multi-tab tile (today's default; zero change)
//   • task    — task-anchored (uses the existing task_id)
//   • project — project-anchored (uses project_id; its Task tab lists/creates
//               the project's tasks, which auto-associate via ctx_tasks.project_id)
// DB column is `text` + CHECK (extend like active_tab). These are INTERNAL
// tokens — user-facing labels live in constants and are rename-safe.
export type TileFlavor = "thread" | "task" | "project";

export const TILE_FLAVORS: readonly TileFlavor[] = [
  "thread",
  "task",
  "project",
] as const;

// ── Resolved context bundle (override ?? session default) ──────────────
// A controlled selection the record carries — NEVER written to appContextSlice
// or ctx_scope_assignments. See features/scopes/FEATURE.md.
export interface TileContext {
  organizationId: string | null;
  scopeIds: string[];
  /** true when the tile carries its own override (not inheriting the session). */
  isOverridden: boolean;
}

// ── Create inputs (service layer) ─────────────────────────────────────
export interface CreateSessionInput {
  title?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  contextScopeIds?: string[];
}

export interface CreateTileInput {
  sessionId: string;
  taskId?: string | null;
  noteId?: string | null;
  activeTab?: TileTab;
  position?: number;
  title?: string | null;
  /** What the tile represents. Defaults to 'thread' (the generic tile). */
  flavor?: TileFlavor;
  /** FK to ctx_projects for a project-flavor tile. The caller must have already
   *  resolved any room/tile project conflict (see thunks `checkTileProjectConflict`). */
  projectId?: string | null;
}
