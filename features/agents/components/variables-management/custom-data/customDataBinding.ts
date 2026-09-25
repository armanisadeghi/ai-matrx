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

/**
 * The starting template for a table: `- {title}: {next field}`. Built from the
 * table's own title column (REC-2) and the first other field, so the author
 * starts from something that already reads well and edits from there.
 */
export function defaultTemplate(
  table: Pick<Table, "title_field"> | null,
  fields: readonly Field[],
): string {
  if (fields.length === 0) return "- {name}";
  const title = fields.find((f) => f.key === table?.title_field) ?? fields[0];
  const other = fields.find((f) => f.key !== title.key);
  return other
    ? `- ${primaryToken(title)}: ${primaryToken(other)}`
    : `- ${primaryToken(title)}`;
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
