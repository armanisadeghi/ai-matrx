// features/make/gallery/mergeBinding.ts — THE ONE builder of an installed merge-field binding.
//
// A template (or, until slice 2 deletes them, a kit) carries an agent variable's binding with
// install-local handles — a table key and a row pointer — and the install resolves them into the
// server's merge-field declaration (`kind: "merge_field"`, snake_case) written onto the copied
// agent's `variable_definitions[i].binding`. Both installers call these functions; neither keeps
// its own copy. Also: `{{table:<key>}}` / `{{agent:<key>}}` placeholders in a workflow definition.

/** The binding written onto a copied agent (the server's merge-field declaration). */
export interface MergeFieldBinding {
  kind: "merge_field";
  source: "record";
  semantic_type: "collection" | "reference" | "value";
  table_id: string;
  record_id?: string;
  field_key?: string;
  match?: Record<string, unknown>;
  limit?: number;
  sort?: { field: string; dir: "asc" | "desc" };
  transform?: { name: string; template?: string; join?: string; max?: number; header?: string };
  missing?: string;
  override_policy?: string;
}

/** The parts of a binding that are not handles — copied onto the installed binding as they are. */
export type MergeFieldBindingBody = Omit<MergeFieldBinding, "table_id" | "record_id" | "kind" | "source"> &
  Partial<Pick<MergeFieldBinding, "kind" | "source">>;

export interface MergeBindingResolver {
  /** The installed table's id for a table handle, or null when the install did not make it. */
  tableId(tableKey: string): string | null | undefined;
  /** The installed row's id for a row handle, or null when the install did not make it. */
  recordId(tableKey: string, row: number | string): string | null | undefined;
}

/**
 * Resolve one binding: `tableKey` (+ `row`, an index or a seed-row key) → ids. A handle the install
 * did not make is a named failure, never a skipped binding.
 */
export function buildMergeFieldBinding(
  body: MergeFieldBindingBody,
  tableKey: string,
  row: number | string | undefined,
  resolve: MergeBindingResolver,
  noun = "template",
): MergeFieldBinding {
  const tableId = resolve.tableId(tableKey);
  if (!tableId) throw new Error(`The binding names the ${noun}'s "${tableKey}" table, which was not created.`);
  const out: MergeFieldBinding = {
    missing: "absent",
    override_policy: "shown_locked",
    ...body,
    kind: "merge_field",
    source: "record",
    table_id: tableId,
  };
  if (row !== undefined && row !== null) {
    const recordId = resolve.recordId(tableKey, row);
    if (!recordId) {
      const which = typeof row === "number" ? `row ${row + 1}` : `row "${row}"`;
      throw new Error(`The binding names ${which} of "${tableKey}", which was not created.`);
    }
    out.record_id = recordId;
  }
  return out;
}

/** `{{table:<key>}}` / `{{agent:<key>}}` / `{{workflow:<key>}}` → ids; an unknown handle is a named failure. */
export function resolveIdPlaceholders(
  definition: unknown,
  bags: Partial<Record<"table" | "agent" | "workflow", Record<string, string> | undefined>>,
  noun = "template",
): unknown {
  const text = JSON.stringify(definition ?? {});
  const replaced = text.replace(/\{\{(table|agent|workflow):([a-zA-Z0-9_\-.]+)\}\}/g, (_m, kind: string, key: string) => {
    const id = bags[kind as "table" | "agent" | "workflow"]?.[key];
    if (!id) throw new Error(`The workflow names the ${noun}'s ${kind} "${key}", which was not created.`);
    return id;
  });
  return JSON.parse(replaced) as unknown;
}
