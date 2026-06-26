// features/war-room/service.ts
//
// Supabase CRUD chokepoint for War Room. React → Supabase directly.

import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { requireUserId } from "@/utils/auth/getUserId";
import { DEFAULT_SESSION_TITLE } from "./constants";
import { listThreadIdsForRoom } from "./service/readApi";
import * as assoc from "./service/associations";
import { roomRef, threadRef } from "./types";
import type {
  CreateSessionInput,
  CreateThreadInput,
  ThreadAnchorType,
  WarRoomSession,
  WarRoomSessionUpdate,
  WarRoomThread,
  WarRoomThreadUpdate,
} from "./types";

// War-room tables live in the `workspace` schema — always reached via
// `workspaceDb(supabase).from(...)` (NOT the public `supabase.from`).
const SESSIONS = "war_rooms";
const THREADS = "threads";

/** A supabase client scoped to the `workspace` schema for war-room tables. */
const wsDb = workspaceDb(supabase);

const NOT_DELETED = { deleted_at: null as null };

async function resolveOrgIdNeverNull(
  orgIdInput: string | null | undefined,
): Promise<string> {
  if (orgIdInput) return orgIdInput;
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

function deriveAnchor(input: CreateThreadInput): {
  anchor_type: ThreadAnchorType;
  anchor_id: string | null;
} {
  if (input.taskId) return { anchor_type: "task", anchor_id: input.taskId };
  if (input.projectId)
    return { anchor_type: "project", anchor_id: input.projectId };
  if (input.anchorType) {
    return {
      anchor_type: input.anchorType,
      anchor_id:
        input.anchorType === "canvas" ? null : (input.anchorId ?? null),
    };
  }
  return { anchor_type: "canvas", anchor_id: null };
}

// ── Sessions ──────────────────────────────────────────────────────────

export async function listSessions(): Promise<WarRoomSession[]> {
  const { data, error } = await wsDb
    .from(SESSIONS)
    .select("*")
    .is("deleted_at", null)
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[war-room] listSessions failed:", error?.message ?? error);
    throw error;
  }
  return data ?? [];
}

export async function getSession(id: string): Promise<WarRoomSession | null> {
  const { data, error } = await wsDb
    .from(SESSIONS)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[war-room] getSession failed:", error?.message ?? error);
    throw error;
  }
  return data ?? null;
}

export async function createSession(
  input: CreateSessionInput = {},
): Promise<WarRoomSession> {
  const userId = requireUserId();
  const organizationId = await resolveOrgIdNeverNull(input.organizationId);
  const { data, error } = await wsDb
    .from(SESSIONS)
    .insert({
      created_by: userId,
      title: input.title?.trim() || DEFAULT_SESSION_TITLE,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      organization_id: organizationId,
      anchor_type: input.projectId ? "project" : "canvas",
      anchor_id: input.projectId ?? null,
      last_opened_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] createSession failed:", error?.message ?? error);
    throw error;
  }

  if (input.projectId) {
    await assoc.createAssignment({
      ref: roomRef(data.id),
      entityType: "project",
      entityId: input.projectId,
      makeActive: true,
    });
  }

  return data;
}

export async function updateSession(
  id: string,
  patch: WarRoomSessionUpdate,
): Promise<WarRoomSession> {
  const { data, error } = await wsDb
    .from(SESSIONS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] updateSession failed:", error?.message ?? error);
    throw error;
  }
  return data;
}

export async function touchSessionOpened(id: string): Promise<void> {
  const { error } = await wsDb
    .from(SESSIONS)
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[war-room] touchSessionOpened failed:", error?.message ?? error);
}

export async function softDeleteSession(id: string): Promise<void> {
  const { error } = await wsDb
    .from(SESSIONS)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[war-room] softDeleteSession failed:", error?.message ?? error);
    throw error;
  }
}

// ── Threads ───────────────────────────────────────────────────────────

/** Every non-deleted thread owned by the caller (RLS-scoped). */
export async function listAllUserThreads(): Promise<WarRoomThread[]> {
  const { data, error } = await wsDb
    .from(THREADS)
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[war-room] listAllUserThreads failed:", error?.message ?? error);
    throw error;
  }
  return data ?? [];
}

/** Threads linked to a room, ordered by position. */
export async function listThreadsForRoom(
  roomId: string,
): Promise<WarRoomThread[]> {
  const threadIds = await listThreadIdsForRoom(roomId);
  if (threadIds.length === 0) return [];

  const { data, error } = await wsDb
    .from(THREADS)
    .select("*")
    .in("id", threadIds)
    .is("deleted_at", null);

  if (error) {
    console.error("[war-room] listThreadsForRoom failed:", error?.message ?? error);
    throw error;
  }

  const byId = new Map((data ?? []).map((t) => [t.id, t]));
  return threadIds
    .map((id) => byId.get(id))
    .filter((t): t is WarRoomThread => !!t)
    .sort((a, b) => a.position - b.position);
}

export async function getThread(id: string): Promise<WarRoomThread | null> {
  const { data, error } = await wsDb
    .from(THREADS)
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[war-room] getThread failed:", error?.message ?? error);
    throw error;
  }
  return data ?? null;
}

export async function createThread(
  input: CreateThreadInput,
): Promise<WarRoomThread> {
  const userId = requireUserId();
  let organizationId = await resolveOrgIdNeverNull(null);

  if (input.roomId) {
    const { data: roomRow } = await wsDb
      .from(SESSIONS)
      .select("organization_id")
      .eq("id", input.roomId)
      .maybeSingle();
    organizationId = await resolveOrgIdNeverNull(roomRow?.organization_id);
  }

  const anchor = deriveAnchor(input);
  const { data, error } = await wsDb
    .from(THREADS)
    .insert({
      created_by: userId,
      organization_id: organizationId,
      active_tab: input.activeTab ?? "task",
      position: input.position ?? 0,
      title: input.title ?? null,
      anchor_type: anchor.anchor_type,
      anchor_id: anchor.anchor_id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] createThread failed:", error?.message ?? error);
    throw error;
  }

  if (input.roomId) {
    await assoc.attachThreadToRoom(data.id, input.roomId);
  }

  return data;
}

export async function updateThread(
  id: string,
  patch: WarRoomThreadUpdate,
): Promise<WarRoomThread> {
  const { data, error } = await wsDb
    .from(THREADS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] updateThread failed:", error?.message ?? error);
    throw error;
  }
  return data;
}

export async function softDeleteThread(id: string): Promise<void> {
  const { error } = await wsDb
    .from(THREADS)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[war-room] softDeleteThread failed:", error?.message ?? error);
    throw error;
  }
}

export async function persistThreadPositions(
  updates: { id: string; position: number }[],
): Promise<void> {
  await Promise.all(
    updates.map(({ id, position }) =>
      wsDb.from(THREADS).update({ position }).eq("id", id),
    ),
  );
}

/** Thread ids with no `thread → war_room` membership edge. */
export async function listOrphanThreadIds(
  allThreadIds: string[],
  assignedThreadIds: Set<string>,
): Promise<string[]> {
  return allThreadIds.filter((id) => !assignedThreadIds.has(id));
}

/** Build the set of thread ids assigned to any room. */
export async function collectAssignedThreadIds(
  roomIds: string[],
): Promise<Set<string>> {
  const results = await Promise.all(
    roomIds.map((id) => listThreadIdsForRoom(id)),
  );
  const assigned = new Set<string>();
  for (const ids of results) {
    for (const id of ids) assigned.add(id);
  }
  return assigned;
}

// Content links: service/associations.ts + thread_contents() RPC.
