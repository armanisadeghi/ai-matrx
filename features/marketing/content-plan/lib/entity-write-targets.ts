/**
 * features/marketing/content-plan/lib/entity-write-targets.ts
 *
 * PURE validation for the two `matrx-user/content-plan-entities` write paths
 * that need to check a value against LIVE PAGE STATE rather than a static
 * vocabulary: a `plan_source_type` category id, and the id of an entity to
 * open in the editor.
 *
 * Why a separate module rather than inline checks like `requireLabel` /
 * `requireEntityType` in `EntityManager.tsx`: those two check a value against
 * a constant, so they read fine inline. These two check against a list that
 * only exists at runtime (the loaded category dimension, the loaded roster),
 * which means the interesting cases — the list has not loaded yet, the id is
 * plausible but not offered — are worth testing directly. They are kept out
 * of the React setters so the throw lands synchronously in the handler's own
 * call frame, where the surface-writeback seam converts it into the error
 * envelope the agent reads; a check inside a `setState` updater throws on
 * React's render stack instead, where the seam never sees it and the agent is
 * told the write succeeded.
 */

/**
 * `entity_draft.source_type_id` — a category UUID the editor's Source type
 * picker actually offers, or `null` for its "None" option.
 *
 * `offeredIds` is the live `plan_source_type` dimension. Empty means it has
 * not loaded, and we refuse rather than trust: with no list there is no way
 * to tell a real id from an invented one, and silently accepting would write
 * a dangling FK the user cannot see in the dropdown.
 */
export function parseSourceTypeIdWrite(
  raw: unknown,
  targetName: string,
  offeredIds: readonly string[],
): string | null {
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new Error(
      `${targetName}: source_type_id must be a category UUID from source_type_options, or null to clear it. Received ${typeof raw}.`,
    );
  }
  const id = raw.trim();
  if (id.length === 0) {
    throw new Error(
      `${targetName}: source_type_id is empty. Send null to clear the source type.`,
    );
  }
  if (offeredIds.length === 0) {
    throw new Error(
      `${targetName}: the plan_source_type options have not loaded yet, so "${id}" cannot be checked against them. Retry once source_type_options is non-empty, or send null.`,
    );
  }
  if (!offeredIds.includes(id)) {
    throw new Error(
      `${targetName}: "${id}" is not one of this workspace's plan_source_type category ids. Pick an id from the surface's source_type_options value (match on its name), or send null.`,
    );
  }
  return id;
}

/**
 * `open_entity_editor` — a live entity id to edit, or `null` (or `""`) to open
 * a blank New entity dialog. Returns the id or null; the caller looks the row
 * up and seeds the draft from it.
 */
export function parseOpenEntityEditorWrite(
  value: unknown,
  liveEntityIds: readonly string[],
  linkedPartyIds: readonly string[] = [],
): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(
      `open_entity_editor: expected a source/media entity UUID from entities_detail, or null to open a blank New source dialog. Received ${typeof value}.`,
    );
  }
  const id = value.trim();
  if (linkedPartyIds.includes(id)) {
    // A person/company is a CRM record, not a plan.entity row — the editor
    // dialog cannot open it, but the agent named a real thing; say where it
    // lives instead of pretending it does not exist.
    throw new Error(
      `open_entity_editor: "${id}" is a person/company — a CRM record, not a source. It is managed at /crm/${id}; this dialog edits sources and media only.`,
    );
  }
  if (!liveEntityIds.includes(id)) {
    throw new Error(
      `open_entity_editor: "${id}" is not a live source on this site. Pick a source/media id from entities_detail, or send null to open a blank New source dialog.`,
    );
  }
  return id;
}
