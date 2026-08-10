/**
 * features/marketing/content-plan/lib/entity-write-targets.ts
 *
 * The PURE validation core behind `matrx-user/content-plan-entities`'s write
 * targets (`open_entity_editor`, `entity_draft`, `create_entity`).
 *
 * Why a separate module rather than inline checks in the handlers: the
 * surface-writeback seam turns a handler THROW into the error envelope the
 * agent reads, so validation has to run synchronously in the handler's own
 * call frame. A check hidden inside a `setState` updater throws on React's
 * render stack instead, where the seam never sees it and the agent is told
 * the write succeeded. Parse here, then set state with an already-valid value.
 *
 * The vocabularies are IMPORTED, never re-typed: `PLAN_ENTITY_TYPES` is the
 * same constant the editor's Type select renders from and the manifest
 * description interpolates, so the contract the model reads, the options the
 * user sees, and the values this module accepts cannot drift.
 */

import { PLAN_ENTITY_TYPES, type PlanEntityType } from "../types";

/**
 * Sanity bound on an entity label. NOT a database constraint — `plan.entity.
 * label` is unbounded text. It is the roster list's practical limit: the row
 * renders the label on one truncated line, so a paragraph-length "label" is
 * an agent mistaking this field for a description, which is worth refusing
 * loudly rather than storing something the user cannot read back.
 */
export const PLAN_ENTITY_LABEL_MAX_CHARS = 200;

/** The keys `entity_draft` accepts — the editor dialog's three inputs. */
export const ENTITY_DRAFT_KEYS = [
  "label",
  "entity_type",
  "source_type_id",
] as const;

/** A partial stage into the open editor dialog. Absent key = leave alone. */
export interface EntityDraftWrite {
  label?: string;
  entity_type?: PlanEntityType;
  /** `null` clears the source type (the picker's "None"). */
  source_type_id?: string | null;
}

/** A full new-entity proposal, ready for the canonical create service. */
export interface CreateEntityWrite {
  label: string;
  entity_type: PlanEntityType;
  source_type_id: string | null;
  attributes: Record<string, unknown> | null;
}

/** Options a caller threads in from live page state. */
export interface EntityWriteContext {
  /**
   * Every `plan_source_type` category id currently offered by the picker.
   * Empty means the dimension has not loaded — a source-type write is then
   * refused rather than trusted, because we cannot tell a real id from a
   * hallucinated one.
   */
  sourceTypeIds: readonly string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

const ENTITY_TYPE_LIST = PLAN_ENTITY_TYPES.join(" | ");

function parseLabel(raw: unknown, targetName: string): string {
  if (typeof raw !== "string") {
    throw new Error(
      `${targetName}: label must be a plain string (the entity's display name, e.g. "Dr. Jane Smith"). Received ${typeof raw}.`,
    );
  }
  const label = raw.trim();
  if (label.length === 0) {
    throw new Error(
      `${targetName}: label is empty. An entity needs a name — omit the key instead of sending a blank one.`,
    );
  }
  if (label.length > PLAN_ENTITY_LABEL_MAX_CHARS) {
    throw new Error(
      `${targetName}: label is ${label.length} characters; the maximum is ${PLAN_ENTITY_LABEL_MAX_CHARS}. This field is a name, not a description — put the reasoning in attributes.`,
    );
  }
  return label;
}

function parseEntityType(raw: unknown, targetName: string): PlanEntityType {
  if (typeof raw !== "string") {
    throw new Error(
      `${targetName}: entity_type must be a string, one of ${ENTITY_TYPE_LIST}. Received ${typeof raw}.`,
    );
  }
  if (!(PLAN_ENTITY_TYPES as readonly string[]).includes(raw)) {
    throw new Error(
      `${targetName}: entity_type must be one of ${ENTITY_TYPE_LIST}. Received "${raw}".`,
    );
  }
  return raw as PlanEntityType;
}

function parseSourceTypeId(
  raw: unknown,
  targetName: string,
  context: EntityWriteContext,
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
  if (context.sourceTypeIds.length === 0) {
    throw new Error(
      `${targetName}: the plan_source_type options have not loaded yet, so "${id}" cannot be checked against them. Retry once source_type_options is non-empty, or send null.`,
    );
  }
  if (!context.sourceTypeIds.includes(id)) {
    throw new Error(
      `${targetName}: "${id}" is not one of this workspace's plan_source_type category ids. Pick an id from the surface's source_type_options value (match on its name), or send null.`,
    );
  }
  return id;
}

/**
 * `entity_draft` — a PARTIAL stage into the open editor dialog. At least one
 * recognised key must be present; an unknown key is refused rather than
 * ignored, because a silently-dropped key reads to the agent as an applied
 * write.
 */
export function parseEntityDraftWrite(
  value: unknown,
  context: EntityWriteContext,
): EntityDraftWrite {
  if (!isPlainObject(value)) {
    throw new Error(
      `entity_draft: expected an object with any of ${ENTITY_DRAFT_KEYS.join(", ")} — not a bare string and not JSON-encoded text. Received ${Array.isArray(value) ? "array" : typeof value}.`,
    );
  }
  const unknownKeys = Object.keys(value).filter(
    (key) => !(ENTITY_DRAFT_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `entity_draft: unsupported key(s) ${unknownKeys.map((key) => `"${key}"`).join(", ")}. The editor holds only ${ENTITY_DRAFT_KEYS.join(", ")}; entity attributes are set at creation time via create_entity.`,
    );
  }

  const draft: EntityDraftWrite = {};
  if ("label" in value) draft.label = parseLabel(value.label, "entity_draft");
  if ("entity_type" in value) {
    draft.entity_type = parseEntityType(value.entity_type, "entity_draft");
  }
  if ("source_type_id" in value) {
    draft.source_type_id = parseSourceTypeId(
      value.source_type_id,
      "entity_draft",
      context,
    );
  }

  if (Object.keys(draft).length === 0) {
    throw new Error(
      `entity_draft: nothing to stage — include at least one of ${ENTITY_DRAFT_KEYS.join(", ")}.`,
    );
  }
  return draft;
}

/**
 * `create_entity` — a COMPLETE new roster entry. `label` and `entity_type`
 * are required (an entity without either is not a proposal); `source_type_id`
 * and `attributes` are optional.
 */
export function parseCreateEntityWrite(
  value: unknown,
  context: EntityWriteContext,
): CreateEntityWrite {
  if (!isPlainObject(value)) {
    throw new Error(
      `create_entity: expected an object with label and entity_type — not a bare string and not JSON-encoded text. Received ${Array.isArray(value) ? "array" : typeof value}.`,
    );
  }
  const allowed = [...ENTITY_DRAFT_KEYS, "attributes"];
  const unknownKeys = Object.keys(value).filter(
    (key) => !allowed.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `create_entity: unsupported key(s) ${unknownKeys.map((key) => `"${key}"`).join(", ")}. Accepted keys are ${allowed.join(", ")} — the site and organization come from the open workspace, never from the caller.`,
    );
  }
  if (!("label" in value)) {
    throw new Error("create_entity: label is required.");
  }
  if (!("entity_type" in value)) {
    throw new Error(
      `create_entity: entity_type is required — one of ${ENTITY_TYPE_LIST}.`,
    );
  }

  let attributes: Record<string, unknown> | null = null;
  if ("attributes" in value && value.attributes !== null) {
    if (!isPlainObject(value.attributes)) {
      throw new Error(
        `create_entity: attributes must be a JSON object (or omitted). Received ${Array.isArray(value.attributes) ? "array" : typeof value.attributes}.`,
      );
    }
    attributes = value.attributes;
  }

  return {
    label: parseLabel(value.label, "create_entity"),
    entity_type: parseEntityType(value.entity_type, "create_entity"),
    source_type_id:
      "source_type_id" in value
        ? parseSourceTypeId(value.source_type_id, "create_entity", context)
        : null,
    attributes,
  };
}

/**
 * `open_entity_editor` — a live entity id to edit, or `null` to open a blank
 * New entity dialog. Returns the id (or null); the caller looks the row up.
 */
export function parseOpenEntityEditorWrite(
  value: unknown,
  entityIds: readonly string[],
): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(
      `open_entity_editor: expected an entity UUID from entities_detail, or null to open a blank New entity dialog. Received ${typeof value}.`,
    );
  }
  const id = value.trim();
  if (!entityIds.includes(id)) {
    throw new Error(
      `open_entity_editor: "${id}" is not a live entity on this site. Pick an id from entities_detail, or send null to open a blank New entity dialog.`,
    );
  }
  return id;
}
