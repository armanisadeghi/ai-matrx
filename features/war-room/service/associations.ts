// features/war-room/service/associations.ts
//
// The single Supabase chokepoint for War Room ASSOCIATIONS — the polymorphic
// M2M table (ctx_war_room_assignments) that replaces the tile FK columns
// (task_id/note_id/project_id) AND the three link tables (notes / audio_sessions
// / attachments). A container (room = session, thread = tile) holds ANY resource
// type, M2M. Shaped like ctx_scope_assignments so the imminent platform-wide
// relationship refactor absorbs it trivially.
//
// React → Supabase directly (no Next.js middle tier); RLS enforces access.
// Every mutation is loud on failure (throws) — callers wrap with reportWarRoomError.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import type { Json } from "@/types/database.types";
import {
  SINGLE_ACTIVE_ENTITY_TYPES,
  type ContainerRef,
  type WarRoomAssignment,
  type WarRoomAssignmentEntityType,
} from "../types";

const ASSIGNMENTS = "ctx_war_room_assignments";

/** All assignment rows for a set of containers (room + its threads), one query. */
export async function listAssignmentsForContainers(
  refs: ContainerRef[],
): Promise<WarRoomAssignment[]> {
  const ids = Array.from(new Set(refs.map((r) => r.id)));
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .select("*")
    .in("container_id", ids)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[war-room] listAssignmentsForContainers failed:", error);
    throw error;
  }
  return data ?? [];
}

/** Assignment rows for one container. */
export async function listAssignmentsForContainer(
  ref: ContainerRef,
): Promise<WarRoomAssignment[]> {
  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .select("*")
    .eq("container_type", ref.type)
    .eq("container_id", ref.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[war-room] listAssignmentsForContainer failed:", error);
    throw error;
  }
  return data ?? [];
}

interface CreateAssignmentInput {
  ref: ContainerRef;
  entityType: WarRoomAssignmentEntityType;
  entityId: string;
  /** Make this the active/focused member of its type (demotes same-type siblings). */
  makeActive?: boolean;
  label?: string | null;
  metadata?: Json | null;
}

/**
 * Attach a resource to a container. For single-active types (task/project/note/
 * studio_session) `makeActive` (default true) demotes the prior active one. The
 * UNIQUE (container, entity_type, entity_id) constraint makes re-attaching the
 * same resource idempotent — callers tolerate the 23505 conflict.
 */
export async function createAssignment(
  input: CreateAssignmentInput,
): Promise<WarRoomAssignment> {
  const userId = requireUserId();
  const { ref, entityType, entityId } = input;
  const single = SINGLE_ACTIVE_ENTITY_TYPES.has(entityType);
  const makeActive = input.makeActive ?? true;

  // Position = count of same-type rows already in this container.
  const existing = await listAssignmentsForContainer(ref);
  const sameType = existing.filter((a) => a.entity_type === entityType);

  if (single && makeActive && sameType.length > 0) {
    await supabase
      .from(ASSIGNMENTS)
      .update({ is_active: false })
      .eq("container_type", ref.type)
      .eq("container_id", ref.id)
      .eq("entity_type", entityType);
  }

  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .insert({
      container_type: ref.type,
      container_id: ref.id,
      entity_type: entityType,
      entity_id: entityId,
      user_id: userId,
      position: sameType.length,
      is_active: single ? makeActive : true,
      label: input.label ?? null,
      metadata: input.metadata ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[war-room] createAssignment failed:", error);
    throw error;
  }
  return data;
}

/** Mark one resource as the active member of its type within the container. */
export async function setActiveAssignment(
  ref: ContainerRef,
  entityType: WarRoomAssignmentEntityType,
  entityId: string,
): Promise<void> {
  await supabase
    .from(ASSIGNMENTS)
    .update({ is_active: false })
    .eq("container_type", ref.type)
    .eq("container_id", ref.id)
    .eq("entity_type", entityType);

  const { error } = await supabase
    .from(ASSIGNMENTS)
    .update({ is_active: true })
    .eq("container_type", ref.type)
    .eq("container_id", ref.id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (error) {
    console.error("[war-room] setActiveAssignment failed:", error);
    throw error;
  }
}

/** Remove one assignment row by id. */
export async function removeAssignment(id: string): Promise<void> {
  const { error } = await supabase.from(ASSIGNMENTS).delete().eq("id", id);
  if (error) {
    console.error("[war-room] removeAssignment failed:", error);
    throw error;
  }
}

/** Remove a resource from a container by its (type, entity) tuple. */
export async function removeAssignmentByEntity(
  ref: ContainerRef,
  entityType: WarRoomAssignmentEntityType,
  entityId: string,
): Promise<void> {
  const { error } = await supabase
    .from(ASSIGNMENTS)
    .delete()
    .eq("container_type", ref.type)
    .eq("container_id", ref.id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (error) {
    console.error("[war-room] removeAssignmentByEntity failed:", error);
    throw error;
  }
}

/**
 * Move EVERY assignment from one container to another (thread portability:
 * move a thread's resources into a different room/thread, or re-home a thread).
 * Re-points container_type + container_id. Returns the moved rows.
 */
export async function moveContainerAssignments(
  from: ContainerRef,
  to: ContainerRef,
): Promise<WarRoomAssignment[]> {
  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .update({ container_type: to.type, container_id: to.id })
    .eq("container_type", from.type)
    .eq("container_id", from.id)
    .select("*");
  if (error) {
    console.error("[war-room] moveContainerAssignments failed:", error);
    throw error;
  }
  return data ?? [];
}

/**
 * Copy every assignment of one container onto another (thread IMPORT: duplicate
 * a thread's resource links into a new room without removing the originals).
 * Idempotent via the UNIQUE constraint.
 */
export async function copyContainerAssignments(
  from: ContainerRef,
  to: ContainerRef,
): Promise<WarRoomAssignment[]> {
  const userId = requireUserId();
  const source = await listAssignmentsForContainer(from);
  if (source.length === 0) return [];
  const rows = source.map((a) => ({
    container_type: to.type,
    container_id: to.id,
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    user_id: userId,
    position: a.position,
    is_active: a.is_active,
    label: a.label,
    metadata: a.metadata,
  }));
  const { data, error } = await supabase
    .from(ASSIGNMENTS)
    .upsert(rows, {
      onConflict: "container_type,container_id,entity_type,entity_id",
      ignoreDuplicates: true,
    })
    .select("*");
  if (error) {
    console.error("[war-room] copyContainerAssignments failed:", error);
    throw error;
  }
  return data ?? [];
}
