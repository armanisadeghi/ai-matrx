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
  // A thread may inherit an entity from its anchor and also attach that same
  // entity directly. It is one resource, not two selector rows. Prefer the
  // direct edge because only it carries thread-local label/active metadata.
  const modulesByEntity = new Map<string, ThreadContentModule>();
  for (const contentModule of modules) {
    const entityType = sourceToEntity(contentModule.module_type);
    const key = `${entityType}:${contentModule.module_id}`;
    const existing = modulesByEntity.get(key);
    if (!existing || contentModule.origin === "thread") {
      modulesByEntity.set(key, contentModule);
    }
  }

  const activeSeen = new Set<string>();
  const out: WarRoomAssignment[] = [];

  [...modulesByEntity.values()].forEach((contentModule, index) => {
    const entityType = sourceToEntity(contentModule.module_type);
    const md = contentModule.metadata;
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
      origin: contentModule.origin,
      anchor_type: contentModule.anchor_type,
      anchor_id: contentModule.anchor_id,
      via: "thread_contents",
    };

    out.push({
      id: syntheticAssignmentId(
        threadId,
        contentModule.module_type,
        contentModule.module_id,
      ),
      container_type: "thread",
      container_id: threadId,
      entity_type: entityType,
      entity_id: contentModule.module_id,
      position,
      is_active: isActive,
      label: contentModule.label ?? null,
      metadata,
      created_by: null,
      created_at: null,
    });
  });

  return out;
}
