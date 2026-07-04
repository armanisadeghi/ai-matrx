// features/war-room/utils/threadContentsToAssignments.ts
//
// Maps thread content edges into the `WarRoomAssignment` bucket shape so Redux
// selectors (`selectNoteIdsForThread`, etc.) stay unchanged.
//
// The token vocabulary is OPEN (any registered entity type passes through;
// only the legacy `file → user_file` alias is mapped). Own-thread rows carry
// their REAL edge metadata, so `is_active` / `position` / `canvas` / `pinned`
// survive hydration; anchor-inherited rows (whose edges describe the anchor's
// container, not this thread) get thread-local state synthesized.

import type { Json } from "@/types/database.types";
import { sourceToEntity } from "../service/associations";
import {
  SINGLE_ACTIVE_ENTITY_TYPES,
  type ThreadContentModule,
  type WarRoomAssignment,
} from "../types";

/** Synthetic id — stable for a thread/module pair; writes use entity type + id. */
function syntheticAssignmentId(
  threadId: string,
  moduleType: string,
  moduleId: string,
): string {
  return `tc:${threadId}:${moduleType}:${moduleId}`;
}

function isPlainObject(v: Json | null | undefined): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Convert one thread's content edges into assignment buckets.
 * Real edge metadata wins; for rows without it (anchor-inherited), position
 * follows row order and the first row per single-active type is marked active.
 */
export function mapThreadContentsToAssignments(
  threadId: string,
  modules: ThreadContentModule[],
): WarRoomAssignment[] {
  const activeSeen = new Set<string>();
  const out: WarRoomAssignment[] = [];

  modules.forEach((module, index) => {
    const entityType = sourceToEntity(module.module_type);
    const md = module.metadata;
    const hasRealMeta = isPlainObject(md);

    const isSingleActive = SINGLE_ACTIVE_ENTITY_TYPES.has(entityType);
    let isActive: boolean;
    if (hasRealMeta && typeof md.is_active === "boolean") {
      isActive = md.is_active;
    } else {
      isActive = isSingleActive ? !activeSeen.has(entityType) : true;
    }
    if (isSingleActive && isActive) activeSeen.add(entityType);

    const position =
      hasRealMeta && typeof md.position === "number" ? md.position : index;

    const metadata: Json = {
      ...(hasRealMeta ? md : {}),
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
      position,
      is_active: isActive,
      label: module.label ?? null,
      metadata,
      created_by: null,
      created_at: null,
    });
  });

  return out;
}
