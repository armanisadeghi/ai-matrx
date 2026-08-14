/**
 * Bridge: the scopes/context-item vocabulary (`ContextValueType`) onto the
 * shared format registry, so a context item and a data-table column that both
 * say "currency" format the SAME way through the SAME code.
 *
 * `ContextValueType` stays the storage vocabulary for `ctx_context_item_values`
 * (it decides which `value_*` column is written). This map only says how a
 * value of that type should be DISPLAYED.
 */
import type { ContextValueType } from "@/features/agent-context/types";
import type { FieldFormatId } from "./types";

const MAP: Partial<Record<ContextValueType, FieldFormatId>> = {
  string: "text",
  number: "number",
  boolean: "boolean",
  date: "date",
  datetime: "datetime",
  email: "email",
  url: "url",
  phone: "phone",
  percent: "percent",
  color: "color",
  markdown: "markdown",
  currency: "currency",
  object: "json",
  array: "array",
};

export function contextValueTypeToFormat(
  type: ContextValueType | null | undefined,
): FieldFormatId | null {
  if (!type) return null;
  return MAP[type] ?? null;
}
