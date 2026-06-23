// features/war-room/types.ts
//
// War Room domain types. Supabase-generated rows are the source of truth — we
// alias them directly (snake_case) rather than maintaining a parallel mapped
// shape. See features/war-room/FEATURE.md.

import type { Database } from "@/types/database.types";

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

export type WarRoomTileAudioSession =
  Database["public"]["Tables"]["ctx_war_room_tile_audio_sessions"]["Row"];
export type WarRoomTileAudioSessionInsert =
  Database["public"]["Tables"]["ctx_war_room_tile_audio_sessions"]["Insert"];

export type WarRoomTileNote =
  Database["public"]["Tables"]["ctx_war_room_tile_notes"]["Row"];
export type WarRoomTileNoteInsert =
  Database["public"]["Tables"]["ctx_war_room_tile_notes"]["Insert"];

// Polymorphic attachment link (entity_type ∈ {'user_file','document'}). One row
// per file/doc linked to a tile; the linked entity lives in cld_files /
// udt_documents and is hydrated client-side for display.
export type WarRoomTileAttachment =
  Database["public"]["Tables"]["ctx_war_room_tile_attachments"]["Row"];
export type WarRoomTileAttachmentInsert =
  Database["public"]["Tables"]["ctx_war_room_tile_attachments"]["Insert"];

/** The two entity kinds an attachment row can point at. */
export type TileAttachmentEntityType = "user_file" | "document";

// ── Associations (the polymorphic M2M model) ──────────────────────────
// One table — ctx_war_room_assignments — replaces the tile FK columns
// (task_id/note_id/project_id) AND the three link tables. A container (a room =
// session, or a thread = tile) holds ANY resource type, M2M. Shaped like
// ctx_scope_assignments so the platform-wide relationship refactor absorbs it.
// See features/war-room/service/associations.ts + migrations/ctx_war_room_assignments.sql.
export type WarRoomAssignment =
  Database["public"]["Tables"]["ctx_war_room_assignments"]["Row"];
export type WarRoomAssignmentInsert =
  Database["public"]["Tables"]["ctx_war_room_assignments"]["Insert"];

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
