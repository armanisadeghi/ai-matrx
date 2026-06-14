// features/war-room/service.ts
//
// The single Supabase CRUD chokepoint for War Room. React → Supabase directly
// (no Next.js middle tier). All writes are owner-scoped; RLS enforces access.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import type { Json } from "@/types/database.types";
import { DEFAULT_SESSION_TITLE } from "./constants";
import type {
  CreateSessionInput,
  CreateTileInput,
  WarRoomSession,
  WarRoomSessionUpdate,
  WarRoomTile,
  WarRoomTileAudioSession,
  WarRoomTileUpdate,
} from "./types";

const SESSIONS = "ctx_war_room_sessions";
const TILES = "ctx_war_room_tiles";
const TILE_AUDIO = "ctx_war_room_tile_audio_sessions";

// ── Sessions ──────────────────────────────────────────────────────────

/** All of the current user's saved War Rooms, most-recently-touched first. */
export async function listSessions(): Promise<WarRoomSession[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .from(SESSIONS)
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[war-room] listSessions failed:", error);
    throw error;
  }
  return data ?? [];
}

export async function getSession(id: string): Promise<WarRoomSession | null> {
  const { data, error } = await supabase
    .from(SESSIONS)
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    console.error("[war-room] getSession failed:", error);
    throw error;
  }
  return data ?? null;
}

export async function createSession(
  input: CreateSessionInput = {},
): Promise<WarRoomSession> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .from(SESSIONS)
    .insert({
      user_id: userId,
      title: input.title?.trim() || DEFAULT_SESSION_TITLE,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      organization_id: input.organizationId ?? null,
      project_id: input.projectId ?? null,
      context_scope_ids: (input.contextScopeIds ?? []) as unknown as Json,
      last_opened_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] createSession failed:", error);
    throw error;
  }
  return data;
}

export async function updateSession(
  id: string,
  patch: WarRoomSessionUpdate,
): Promise<WarRoomSession> {
  const { data, error } = await supabase
    .from(SESSIONS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] updateSession failed:", error);
    throw error;
  }
  return data;
}

/** Bump last_opened_at so the room sorts to the top of /all. Fire-and-forget. */
export async function touchSessionOpened(id: string): Promise<void> {
  const { error } = await supabase
    .from(SESSIONS)
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[war-room] touchSessionOpened failed:", error);
}

export async function softDeleteSession(id: string): Promise<void> {
  const { error } = await supabase
    .from(SESSIONS)
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) {
    console.error("[war-room] softDeleteSession failed:", error);
    throw error;
  }
}

// ── Tiles ─────────────────────────────────────────────────────────────

export async function listTiles(sessionId: string): Promise<WarRoomTile[]> {
  const { data, error } = await supabase
    .from(TILES)
    .select("*")
    .eq("session_id", sessionId)
    .eq("is_deleted", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[war-room] listTiles failed:", error);
    throw error;
  }
  return data ?? [];
}

export async function createTile(input: CreateTileInput): Promise<WarRoomTile> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .from(TILES)
    .insert({
      session_id: input.sessionId,
      user_id: userId,
      task_id: input.taskId ?? null,
      note_id: input.noteId ?? null,
      active_tab: input.activeTab ?? "task",
      position: input.position ?? 0,
      title: input.title ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] createTile failed:", error);
    throw error;
  }
  return data;
}

export async function updateTile(
  id: string,
  patch: WarRoomTileUpdate,
): Promise<WarRoomTile> {
  const { data, error } = await supabase
    .from(TILES)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] updateTile failed:", error);
    throw error;
  }
  return data;
}

export async function softDeleteTile(id: string): Promise<void> {
  const { error } = await supabase
    .from(TILES)
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) {
    console.error("[war-room] softDeleteTile failed:", error);
    throw error;
  }
}

/** Persist a batch of (id, position) updates after a reorder. */
export async function persistTilePositions(
  updates: { id: string; position: number }[],
): Promise<void> {
  await Promise.all(
    updates.map(({ id, position }) =>
      supabase.from(TILES).update({ position }).eq("id", id),
    ),
  );
}

// ── Tile ↔ audio session links ────────────────────────────────────────

export async function listTileAudioSessions(
  tileId: string,
): Promise<WarRoomTileAudioSession[]> {
  const { data, error } = await supabase
    .from(TILE_AUDIO)
    .select("*")
    .eq("tile_id", tileId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[war-room] listTileAudioSessions failed:", error);
    throw error;
  }
  return data ?? [];
}

/** All audio links for a session's tiles, in one round-trip (hydration). */
export async function listSessionAudioLinks(
  sessionId: string,
): Promise<WarRoomTileAudioSession[]> {
  const tiles = await listTiles(sessionId);
  const tileIds = tiles.map((t) => t.id);
  if (tileIds.length === 0) return [];

  const { data, error } = await supabase
    .from(TILE_AUDIO)
    .select("*")
    .in("tile_id", tileIds)
    .order("position", { ascending: true });

  if (error) {
    console.error("[war-room] listSessionAudioLinks failed:", error);
    throw error;
  }
  return data ?? [];
}
