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

// ── Tile tabs ─────────────────────────────────────────────────────────
export type TileTab = "task" | "notes" | "audio" | "files" | "combined";

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
}
