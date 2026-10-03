/**
 * The record primitives, slice 4.1 (KINDS-GLUE wave 4 §A.3; chair rulings V1/V2, 2026-10-03):
 *
 * - `relation` — a pointer at ONE record or platform thing that already exists. Drawn as a chip
 *   that opens through that token's own door (`RelationBlock`), never stored as a row. It is also
 *   read as `platform_record`, its alias (`discriminatorAliases`, the TS twin of the Python
 *   `@kind(aliases=…)` — the one alias mechanism).
 * - `pick_list` — an offer to choose records of ONE Pick list (`pick_list_id`), each choice named
 *   by its `_record_id` and checked against that list's own records as the viewer
 *   (`PickListBlock`). Never an ad-hoc key. Choosing is slice 4.6; this slice only draws.
 *
 * Python-owned models: aidream/aidream/kinds/record_primitives.py.
 */

import type { KindDefinition } from "@ai-matrx/content-ir";

export const RELATION_KIND = "relation";
export const PICK_LIST_KIND = "pick_list";
export const PICK_LIST_MAX_CHOICES = 50;

const RELATION_DEFINITION: KindDefinition = {
  kind: RELATION_KIND,
  schemaSource: "system",
  tier: "eager",
  legacyBlockType: "relation",
  discriminatorAliases: ["platform_record"],
  schema: {
    kind: RELATION_KIND,
    fields: {
      _record_id: { type: "string", required: true },
      token: { type: "string" },
      table_id: { type: "string" },
      label: { type: "string" },
      snapshot: { type: "inline_object", open: true, fields: {} },
    },
  },
};

const PICK_LIST_DEFINITION: KindDefinition = {
  kind: PICK_LIST_KIND,
  schemaSource: "system",
  tier: "eager",
  legacyBlockType: "pick_list",
  schema: {
    kind: PICK_LIST_KIND,
    fields: {
      prompt: { type: "string", required: true },
      choose: { type: "string" },
      pick_list_id: { type: "string", required: true },
      choices: { type: "json[]", required: true },
      allow_other: { type: "boolean" },
      on_choose: { type: "string" },
    },
  },
};

export const RECORD_PRIMITIVE_KIND_DEFINITIONS: KindDefinition[] = [
  RELATION_DEFINITION,
  PICK_LIST_DEFINITION,
];

/** The relation kind and every slug it is also read as — never a hand list. */
export const RELATION_KINDS: ReadonlySet<string> = new Set([
  RELATION_KIND,
  ...(RELATION_DEFINITION.discriminatorAliases ?? []),
]);

export interface PickListChoice {
  recordId: string;
  label: string;
  description: string | null;
}

/**
 * The plain sentence refusing a pick_list's choices before any read, or null — the TS mirror of
 * `pick_list_choice_refusal` (Python). Every choice must be a record of the named list.
 */
export function pickListChoiceRefusal(value: Record<string, unknown>): string | null {
  if (typeof value.pick_list_id !== "string" || !value.pick_list_id) {
    return "A pick list must name the Pick list its choices come from.";
  }
  const choices = value.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "A pick list needs at least one choice.";
  if (choices.length > PICK_LIST_MAX_CHOICES) {
    return `A pick list offers at most ${PICK_LIST_MAX_CHOICES} choices.`;
  }
  const seen = new Set<string>();
  for (const choice of choices) {
    if (typeof choice !== "object" || choice === null) return "Each choice must be a record of the Pick list.";
    const c = choice as Record<string, unknown>;
    const label = typeof c.label === "string" && c.label ? c.label : "A choice";
    const id = typeof c._record_id === "string" ? c._record_id : "";
    if ("key" in c || !id) {
      return `“${label}” is not a record of the Pick list. Every choice must be one of the list's own records.`;
    }
    if (seen.has(id)) return `“${label}” is offered twice. Each record may be offered once.`;
    seen.add(id);
  }
  return null;
}

/** The choices as drawn. Call only after `pickListChoiceRefusal` answered null. */
export function pickListChoices(value: Record<string, unknown>): PickListChoice[] {
  return (value.choices as Record<string, unknown>[]).map((c) => ({
    recordId: String(c._record_id),
    label: typeof c.label === "string" && c.label ? c.label : "Untitled choice",
    description: typeof c.description === "string" && c.description ? c.description : null,
  }));
}

/**
 * What makes a Table a Pick list: drawn as a list AND kept for choices (the mark
 * `custom.pick_list_create` gives every list). `display: list` alone is not enough — an ordinary
 * Table may be drawn as a list too. TS mirror of `pick_list_source_refusal` (Python).
 */
export function pickListSourceRefusal(tableDocument: Record<string, unknown> | null): string | null {
  if (!tableDocument) return "You can't open the Pick list these choices come from.";
  if (tableDocument.display === "list" && tableDocument.kept_for === "choices") return null;
  const name = typeof tableDocument.name === "string" && tableDocument.name ? tableDocument.name : "This table";
  return `“${name}” is a table, not a Pick list, so its records can't be offered as choices.`;
}
