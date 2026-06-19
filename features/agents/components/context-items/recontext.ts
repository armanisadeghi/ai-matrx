/**
 * Re-context helper.
 *
 * An attachment (resource) is sent to the model exactly once — the turn it was
 * attached. If the user later edits the underlying record (a note, a task)
 * inside the drawer, the agent won't see the change unless the record is
 * re-attached to a future turn. This builds the resource `source` for a given
 * drawer item so the caller can dispatch `addResource`.
 *
 * Returns `null` for items that can't be (or needn't be) re-attached — media,
 * webpages, the live working document (already re-sent every turn), etc.
 */

import type { ResourceBlockType } from "@/features/agents/types/instance.types";
import type { ContextDrawerItem } from "./types";

export interface ReattachSpec {
  blockType: ResourceBlockType;
  source: Record<string, unknown>;
}

export function buildReattachSpec(
  item: ContextDrawerItem,
): ReattachSpec | null {
  switch (item.blockType) {
    case "input_notes": {
      const id = item.refs.noteIds?.[0];
      return id
        ? { blockType: "input_notes", source: { note_ids: [id] } }
        : null;
    }
    case "input_task": {
      const id = item.refs.taskIds?.[0];
      return id
        ? { blockType: "input_task", source: { task_ids: [id] } }
        : null;
    }
    default:
      return null;
  }
}

/**
 * Whether the drawer should offer a "re-attach updated version" action for this
 * item. True only for already-sent (origin `block`) editable records whose edit
 * wouldn't otherwise reach the agent.
 */
export function canReattach(item: ContextDrawerItem): boolean {
  return (
    item.origin === "block" && item.editable && buildReattachSpec(item) !== null
  );
}
