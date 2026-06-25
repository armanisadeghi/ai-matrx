// features/war-room/service.ts
//
// The single Supabase CRUD chokepoint for War Room. React → Supabase directly
// (no Next.js middle tier). All writes are owner-scoped; RLS enforces access.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { isPersonalPseudoOrgId } from "@/features/agent-context/redux/hierarchySlice";
import { DEFAULT_SESSION_TITLE } from "./constants";
import type {
  CreateSessionInput,
  CreateTileInput,
  WarRoomSession,
  WarRoomSessionUpdate,
  WarRoomTile,
  WarRoomTileUpdate,
} from "./types";

const SESSIONS = "ctx_war_room_sessions";
const TILES = "ctx_war_room_tiles";

/**
 * Resolve a war-room container's organization_id, NEVER returning null. A real
 * input org (not the "Personal" pseudo-sentinel) wins; otherwise the user's
 * personal org. A NULL-org container would make every association edge into it
 * invisible (`platform.associations` fails closed), so org-on-create is the
 * load-bearing guarantee behind the unified relationship model.
 */
async function resolveOrgIdNeverNull(
  orgIdInput: string | null | undefined,
): Promise<string> {
  const real =
    orgIdInput && !isPersonalPseudoOrgId(orgIdInput) ? orgIdInput : null;
  if (real) return real;
  const userId = requireUserId();
  const { data, error } = await supabase.rpc("ensure_personal_organization", {
    p_user_id: userId,
  });
  if (error || !data) {
    console.error("[war-room] resolveOrgIdNeverNull failed:", error?.message);
    throw error ?? new Error("Could not resolve a war-room organization");
  }
  return data as string;
}

/** The tile's anchor (its singular primary subject) derived from create input.
 *  Task wins over project — matching the A.3 backfill priority — else canvas.
 *  Satisfies the CHECK (`canvas ⇒ anchor_id NULL`, else NOT NULL). */
function deriveAnchor(input: CreateTileInput): {
  anchor_type: "task" | "project" | "canvas";
  anchor_id: string | null;
} {
  if (input.taskId) return { anchor_type: "task", anchor_id: input.taskId };
  if (input.projectId)
    return { anchor_type: "project", anchor_id: input.projectId };
  return { anchor_type: "canvas", anchor_id: null };
}

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
  // org-on-create: a room is a container that holds association edges, so it must
  // carry a real org from birth (never NULL — see resolveOrgIdNeverNull).
  const organizationId = await resolveOrgIdNeverNull(input.organizationId);
  const { data, error } = await supabase
    .from(SESSIONS)
    .insert({
      user_id: userId,
      title: input.title?.trim() || DEFAULT_SESSION_TITLE,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      organization_id: organizationId,
      project_id: input.projectId ?? null,
      // anchor (singular primary subject): a project room is project-anchored.
      anchor_type: input.projectId ? "project" : "canvas",
      anchor_id: input.projectId ?? null,
      context_scope_ids: input.contextScopeIds ?? [],
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

/**
 * Every non-deleted tile across all of the current user's War Rooms — one query
 * for the /all search index (room title → thread title ranking).
 */
export async function listAllUserTiles(): Promise<WarRoomTile[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .from(TILES)
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("session_id", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[war-room] listAllUserTiles failed:", error);
    throw error;
  }
  return data ?? [];
}

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

/**
 * Read a single tile by id (owner-scoped via RLS). Returns null when the tile
 * is missing or soft-deleted. Unlike `listTiles` (session-scoped) this resolves
 * a tile WITHOUT knowing its room — the seam the master tools need to act on a
 * thread in a room that isn't the active one.
 */
export async function getTile(id: string): Promise<WarRoomTile | null> {
  const { data, error } = await supabase
    .from(TILES)
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    console.error("[war-room] getTile failed:", error);
    throw error;
  }
  return data ?? null;
}

export async function createTile(input: CreateTileInput): Promise<WarRoomTile> {
  const userId = requireUserId();
  // A tile is a container too: inherit the room's org (denormalized, NEVER NULL)
  // so its own association edges resolve to the right org, and stamp the anchor
  // (its singular subject) alongside the legacy FKs until those FKs are dropped.
  const { data: sessionRow } = await supabase
    .from(SESSIONS)
    .select("organization_id")
    .eq("id", input.sessionId)
    .maybeSingle();
  const organizationId = await resolveOrgIdNeverNull(sessionRow?.organization_id);
  const anchor = deriveAnchor(input);
  const { data, error } = await supabase
    .from(TILES)
    .insert({
      session_id: input.sessionId,
      user_id: userId,
      organization_id: organizationId,
      task_id: input.taskId ?? null,
      note_id: input.noteId ?? null,
      active_tab: input.activeTab ?? "task",
      position: input.position ?? 0,
      title: input.title ?? null,
      flavor: input.flavor ?? "thread",
      project_id: input.projectId ?? null,
      anchor_type: anchor.anchor_type,
      anchor_id: anchor.anchor_id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] createTile failed:", error);
    throw error;
  }
  return data;
}

/**
 * Stamp `projectId` onto EVERY non-deleted tile in a session that doesn't
 * already carry a project. Used by the "switch to per-thread projects"
 * conversion: the room's project is materialized onto its existing tiles right
 * before the room's own project_id is cleared, so the association is preserved
 * and the room/tile invariant never breaks mid-flight. Leaves `flavor` untouched
 * — a generic thread that inherited the room's project stays a generic thread,
 * it just now carries the project_id explicitly. Returns the updated rows.
 */
export async function applyProjectToAllTiles(
  sessionId: string,
  projectId: string,
): Promise<WarRoomTile[]> {
  const { data, error } = await supabase
    .from(TILES)
    .update({ project_id: projectId })
    .eq("session_id", sessionId)
    .eq("is_deleted", false)
    .is("project_id", null)
    .select("*");

  if (error) {
    console.error("[war-room] applyProjectToAllTiles failed:", error);
    throw error;
  }
  return data ?? [];
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

// NOTE: tile ↔ audio / note / attachment links no longer live here. The
// polymorphic ctx_war_room_assignments table (see service/associations.ts)
// replaced the three per-type link tables AND the tile FK columns. Read the
// active task/note/audio via the war-room selectors; mutate via associations.ts.
