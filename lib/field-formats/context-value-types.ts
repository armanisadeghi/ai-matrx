/**
 * Bridge: the scopes/context-item vocabulary (`ContextFieldKind`) onto the
 * shared format registry, so a context item and a data-table column that both
 * say "currency" format the SAME way through the SAME code.
 *
 * `ContextFieldKind` is the package vocabulary for a context field. This map
 * only says how a value of that kind should be DISPLAYED.
 */
import type { ContextFieldKind } from "@ai-matrx/records/scopes";
import type { FieldFormatId } from "@ai-matrx/design-system/field-formats";

const MAP: Partial<Record<ContextFieldKind, FieldFormatId>> = {
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
  type: ContextFieldKind | null | undefined,
): FieldFormatId | null {
  if (!type) return null;
  return MAP[type] ?? null;
}
