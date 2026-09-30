/**
 * THE SHEET'S RELATION COLUMN, AS THE STORE FIELD THE GRID'S OWN PICKER AND CHIP READ (lane
 * DATA-V2-BASICS-2, BREAKER-3 B3-01, 2026-09-30).
 *
 * MEASURED on production: a Relation column "Follow-up Task" pointing at "Front Desk Follow-ups" opened,
 * in the Sheet, an ordinary choice list ("No options declared yet. Type a value to use one.") and typing
 * "Call Sean" asked to add it to the choices; a reference set in the Grid read as plain text. The Grid has
 * the right controls — records-ui's one RelationPicker (reached through `FieldControl`) and its reference
 * chip (reached through `renderValue`). The Sheet now draws THOSE, never a second picker. They read a
 * store `Field`; the Sheet's column already carries everything they read (its id, key, label, and the
 * relation's target and limit in its format), so the Field is rebuilt from it here, once.
 */
import type { Field } from "@ai-matrx/records";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

export type RelationColumn = {
  /** The store Field's id (the Sheet's column id on a record-store table). */
  id: string;
  field_name: string;
  display_name: string;
  format: FieldFormatConfig | null | undefined;
};

/** The target table a Relation column points at, or null when it names none yet. */
export function relationTargetOf(format: FieldFormatConfig | null | undefined): string | null {
  const t = (format?.options as { relation_target?: unknown } | undefined)?.relation_target;
  return typeof t === "string" && t !== "" ? t : null;
}

/**
 * The store Field for a Relation column — only for `relation` (a Person or Attachment column also
 * stores ids but has its own control). Only the members the picker and the chip read are set.
 */
export function storeFieldForRelationColumn(column: RelationColumn): Field | null {
  if (column.format?.id !== "relation") return null;
  const max = (column.format.options as { relation_max?: unknown } | undefined)?.relation_max;
  const relationMax = typeof max === "number" && max > 0 ? max : 1;
  return {
    id: column.id,
    key: column.field_name,
    label: column.display_name,
    type: "relation",
    relation_target: relationTargetOf(column.format),
    relation_max: relationMax,
    multi: relationMax > 1,
  } as unknown as Field;
}
