// features/war-room/utils/threadContentsToAssignments.ts
//
// Maps `thread_contents()` RPC rows into the existing `WarRoomAssignment` bucket
// shape so Redux selectors (`selectNoteIdsForThread`, etc.) stay unchanged.

import type { Json } from "@/types/database.types";
import {
  SINGLE_ACTIVE_ENTITY_TYPES,
  type ThreadContentModule,
  type WarRoomAssignment,
  type WarRoomAssignmentEntityType,
} from "../types";

const MODULE_TO_ENTITY: Record<string, WarRoomAssignmentEntityType> = {
  project: "project",
  task: "task",
  note: "note",
  conversation: "conversation",
  studio_session: "studio_session",
  file: "user_file",
  document: "document",
};

function moduleToEntityType(
  moduleType: string,
): WarRoomAssignmentEntityType | null {
  return MODULE_TO_ENTITY[moduleType] ?? null;
}

/** Synthetic id — stable for a thread/module pair; writes use entity type + id. */
function syntheticAssignmentId(
  threadId: string,
  moduleType: string,
  moduleId: string,
): string {
  return `tc:${threadId}:${moduleType}:${moduleId}`;
}

/**
 * Convert one thread's `thread_contents()` rows into assignment buckets.
 * Position follows RPC order; first row per single-active type is marked active.
 */
export function mapThreadContentsToAssignments(
  threadId: string,
  modules: ThreadContentModule[],
): WarRoomAssignment[] {
  const activeSeen = new Set<WarRoomAssignmentEntityType>();
  const out: WarRoomAssignment[] = [];

  modules.forEach((module, index) => {
    const entityType = moduleToEntityType(module.module_type);
    if (!entityType) return;

    const isSingleActive = SINGLE_ACTIVE_ENTITY_TYPES.has(entityType);
    const isActive = isSingleActive ? !activeSeen.has(entityType) : true;
    if (isSingleActive && isActive) activeSeen.add(entityType);

    const metadata: Json = {
      origin: module.origin,
      anchor_type: module.anchor_type,
      anchor_id: module.anchor_id,
      via: "thread_contents",
    };

    out.push({
      id: syntheticAssignmentId(threadId, module.module_type, module.module_id),
      container_type: "thread",
      container_id: threadId,
      entity_type: entityType,
      entity_id: module.module_id,
      position: index,
      is_active: isActive,
      label: null,
      metadata,
      created_by: null,
      created_at: null,
    });
  });

  return out;
}
