// features/marketing/seo/topical-map/views/table/editPatches.ts
//
// THE TABLE'S INLINE EDITS → `seo.patch_map_topics` PATCHES, and the one edit
// that is REFUSED instead of dropped.
//
// 🚨 A BLANK NAME REFUSES THE SAVE. `MatrxDataTable` toasts "Changes saved" the
// moment `edit.onSave` resolves, and "Couldn't save: <message>" when it throws.
// The old mapping skipped a name that was blank after trimming; clearing a
// topic's name therefore produced zero patches, an early return, a resolved
// promise, a green "Changes saved" — and the old name still on screen. The
// person was told their edit landed when nothing had happened at all.
//
// So a name field that is PRESENT and blank is a refusal for the WHOLE save,
// never a field to quietly drop and never a per-row partial save: saving the
// good rows while silently discarding the bad one is the same lie, one row
// smaller. The draft stays in the table, so the person fixes the name and saves
// again.
//
// A blank DESCRIPTION is not the same thing: a topic with no description is a
// real, allowed state and `seo.patch_map_topics` takes null for it.
//
// Pure on purpose — the component holds the mutation, this holds the decision.

import type { MapTopicPatch } from "../../types";

/** The sentence the person reads when a name was cleared. */
export const TOPIC_NEEDS_A_NAME = "A topic needs a name.";

export type TopicEditsDecision =
  | { patches: MapTopicPatch[] }
  | { refusal: string };

/**
 * The table's `CellEditsMap` shape, structurally: row id → field id → value.
 * Typed locally (rather than importing the package's map) so this module has
 * no dependency on the grid at all.
 */
export type TopicCellEdits = Record<string, Record<string, unknown>>;

export function topicPatchesFromEdits(edits: TopicCellEdits): TopicEditsDecision {
  const patches: MapTopicPatch[] = [];
  for (const [slug, fields] of Object.entries(edits)) {
    const patch: MapTopicPatch = { slug };
    // The name cell is `topic` in the hierarchy column set and `name` in the
    // flat one; both mean the topic's name.
    const nameEdited = "topic" in fields || "name" in fields;
    if (nameEdited) {
      const raw = "topic" in fields ? fields.topic : fields.name;
      const name = typeof raw === "string" ? raw.trim() : "";
      if (name.length === 0) return { refusal: TOPIC_NEEDS_A_NAME };
      patch.name = name;
    }
    if ("description" in fields) {
      const description = fields.description;
      patch.description =
        typeof description === "string" && description.trim().length > 0
          ? description
          : null;
    }
    if (patch.name !== undefined || patch.description !== undefined) patches.push(patch);
  }
  return { patches };
}
