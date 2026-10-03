/**
 * A TABLE VARIABLE — a variable whose component is `table` (one table) or `tables`
 * (several). Its value is a REFERENCE, never text: a table id for `table`, a list of
 * table ids for `tables`. The person picks from every table she can see; the server
 * reads the table as her and hands the agent its name, id, columns and first rows
 * (aidream `conversation_context/table_reference_variables.py`), so the agent can
 * query it with the `records` tool.
 *
 * Pure helpers — no React, no I/O. The reader accepts every shape a reference travels
 * in (an id, a list, the JSON array a list default is serialized to, `{table_id}`), so a
 * stored default and a freshly picked value read the same.
 */

import type {
  VariableComponentType,
  VariableCustomComponent,
} from "../types/agent-definition.types";

export type TableVariableType = Extract<VariableComponentType, "table" | "tables">;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTableVariableType(
  type: VariableComponentType | string | undefined | null,
): type is TableVariableType {
  return type === "table" || type === "tables";
}

/** The Table type of a variable's component, or null. */
export function tableVariableTypeOf(
  customComponent: Pick<VariableCustomComponent, "type"> | { type?: unknown } | undefined | null,
): TableVariableType | null {
  const type = customComponent?.type;
  return typeof type === "string" && isTableVariableType(type) ? type : null;
}

export function isTableId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Every table id in a Table variable's value, in order, once each. Text that is not an id is dropped. */
export function readTableReference(value: unknown): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (isTableId(v)) {
      const id = v.trim();
      if (!out.includes(id)) out.push(id);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      const ref = (v as Record<string, unknown>).table_id ?? (v as Record<string, unknown>).id;
      if (isTableId(ref)) add(ref);
    }
  };
  if (Array.isArray(value)) value.forEach(add);
  else if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) parsed.forEach(add);
    } catch {
      // not a JSON list — nothing to read
    }
  } else add(value);
  return out;
}

/** The value to store for these ids: one id for `table` (or "" when none), a list for `tables`. */
export function tableReferenceValue(type: TableVariableType, ids: readonly string[]): string | string[] {
  if (type === "table") return ids[0] ?? "";
  return [...ids];
}

/** True when a Table variable has nothing picked. */
export function isEmptyTableReference(value: unknown): boolean {
  return readTableReference(value).length === 0;
}
