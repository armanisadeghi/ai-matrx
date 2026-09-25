/**
 * Pure helpers for the custom-data (`kind: "merge_field"`, `source: "record"`)
 * variable binding — the words a non-technical author sees, the starting row
 * template, and the placeholders a field offers. No React, no I/O.
 */

import type { Field, Table } from "@ai-matrx/records/react";
import { isEntityReferenceConfig } from "@ai-matrx/records/react";
import type { CustomDataBinding } from "@/features/agents/types/agent-definition.types";

export type CustomDataShape = CustomDataBinding["semantic_type"];

/** How each shape is offered to a person. */
export const SHAPE_CHOICES: {
  value: CustomDataShape;
  label: string;
  hint: string;
}[] = [
  {
    value: "collection",
    label: "The whole table",
    hint: "every row, one line each",
  },
  { value: "reference", label: "One record", hint: "a single row" },
  {
    value: "value",
    label: "One field of a record",
    hint: "a single value",
  },
];

/** The short words used in the summary chip: "whole table", "one record", "one field". */
export function shapeWords(shape: CustomDataShape): string {
  switch (shape) {
    case "collection":
      return "whole table";
    case "reference":
      return "one record";
    case "value":
      return "one field";
  }
}

export const MISSING_CHOICES: {
  value: CustomDataBinding["missing"];
  label: string;
  hint: string;
}[] = [
  {
    value: "absent",
    label: "Say it's missing",
    hint: "the agent is told there is no data",
  },
  { value: "block", label: "Stop the run", hint: "nothing runs without it" },
];

/** Default row cap for a whole-table read. A starting value, editable per binding. */
export const DEFAULT_ROW_LIMIT = 40;

/** One insertable placeholder for the row template. */
export interface TemplatePlaceholder {
  token: string;
  label: string;
}

/**
 * The placeholders one field offers. A plain field inserts `{key}`; an
 * entity-reference field (a pointer to a platform thing) inserts its words and
 * its id separately, because "`{model}`" would print an object.
 */
export function placeholdersFor(field: Field): TemplatePlaceholder[] {
  const label = field.label || field.name || field.key;
  if (isEntityReferenceConfig(field.config)) {
    return [
      { token: `{${field.key}.name}`, label: `${label} · name` },
      { token: `{${field.key}.id}`, label: `${label} · id` },
      { token: `{${field.key}.token}`, label: `${label} · token` },
    ];
  }
  return [{ token: `{${field.key}}`, label }];
}

/** The first placeholder token for a field — what a default template uses. */
function primaryToken(field: Field): string {
  return placeholdersFor(field)[0]?.token ?? `{${field.key}}`;
}

/** Words that mark a column as the row's NAME when the table declares none. */
const NAME_LIKE = /(^|_)(name|title|label)$/;
/** Words that mark a column as describing the row — what the agent most needs next. */
const DESCRIPTIVE =
  /(desc|description|summary|notes?|details?|about|why|purpose|role|category|type|group)/;

/** The row's name column: the table's own title field (REC-2), else a name-like key. */
export function titleFieldOf(
  table: Pick<Table, "title_field"> | null,
  fields: readonly Field[],
): Field | undefined {
  const declared = table?.title_field;
  return (
    (declared
      ? fields.find((f) => f.key === declared || f.id === declared)
      : undefined) ??
    fields.find((f) => NAME_LIKE.test(f.key)) ??
    fields[0]
  );
}

/**
 * The starting template for a table: `- {title}: {descriptive} ({descriptive})`.
 * It LEADS with the table's name column (the store's `title_field`), then one or
 * two descriptive columns — so the author starts from something that already
 * reads well ("- Dana Whitfield: Head coach (Strength)") and edits from there.
 */
export function defaultTemplate(
  table: Pick<Table, "title_field"> | null,
  fields: readonly Field[],
): string {
  if (fields.length === 0) return "- {name}";
  const title = titleFieldOf(table, fields) ?? fields[0];
  const rest = fields.filter((f) => f.id !== title.id);
  const described = [
    ...rest.filter((f) => DESCRIPTIVE.test(f.key)),
    ...rest.filter((f) => !DESCRIPTIVE.test(f.key)),
  ].slice(0, 2);
  const [first, second] = described;
  if (!first) return `- ${primaryToken(title)}`;
  return second
    ? `- ${primaryToken(title)}: ${primaryToken(first)} (${primaryToken(second)})`
    : `- ${primaryToken(title)}: ${primaryToken(first)}`;
}

/** A binding is ready to save/preview only when its shape has everything it needs. */
export function isCompleteBinding(binding: CustomDataBinding): boolean {
  if (!binding.table_id) return false;
  if (binding.semantic_type === "collection") return true;
  if (!binding.record_id) return false;
  if (binding.semantic_type === "value") return Boolean(binding.field_key);
  return true;
}

/** A fresh, empty whole-table binding for a newly chosen "From my data" source. */
export function emptyCustomDataBinding(): CustomDataBinding {
  return {
    kind: "merge_field",
    source: "record",
    semantic_type: "collection",
    table_id: "",
    missing: "absent",
    override_policy: "shown_locked",
  };
}
