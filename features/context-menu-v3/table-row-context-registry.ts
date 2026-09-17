import type { ContextMenuExtraSection, ResolvedContextMenuContext } from "./types";
import type { MatrxDataTableRecordControls } from "@ai-matrx/design-system/data-table/types";

export interface TableRowMenuDescriptor {
  context: ResolvedContextMenuContext;
  extraSections: ContextMenuExtraSection[];
}

const descriptors = new WeakMap<object, TableRowMenuDescriptor>();
const resolvers = new Map<string, (rowId: string) => unknown>();

export function createTableRowMenuDescriptor(descriptor: TableRowMenuDescriptor): object {
  const token = {};
  descriptors.set(token, descriptor);
  return token;
}

/** The host's generic row model: complete current row data plus table-owned edit commands. */
export function createDefaultTableRowMenuDescriptor(
  row: unknown,
  controls: MatrxDataTableRecordControls,
): object {
  return createTableRowMenuDescriptor(
    buildDefaultTableRowMenuDescriptor(row, controls),
  );
}

/** Reusable base for a domain menu that keeps the shared row edit controls. */
export function buildDefaultTableRowMenuDescriptor(
  row: unknown,
  controls: MatrxDataTableRecordControls,
): TableRowMenuDescriptor {
  const items = [
    ...(controls.beginEdit
      ? [{ kind: "item" as const, id: "table-edit-row", label: "Edit row", onSelect: controls.beginEdit }]
      : []),
    ...(controls.saveEdits
      ? [{ kind: "item" as const, id: "table-save-row", label: "Save changes", onSelect: () => void controls.saveEdits?.() }]
      : []),
    ...(controls.cancelEdits
      ? [{ kind: "item" as const, id: "table-discard-row", label: "Discard changes", onSelect: controls.cancelEdits }]
      : []),
  ];
  return {
    context: {
      content: JSON.stringify(row, null, 2) ?? String(row),
      context: row,
      __entity: null,
    },
    extraSections: items.length === 0
      ? []
      : [{ id: "table-row", label: "Row", primary: true, anchor: "after-clipboard", items }],
  };
}

export function registerTableRowContextResolver(tableId: string, resolve: (rowId: string) => unknown) {
  resolvers.set(tableId, resolve);
  return () => { if (resolvers.get(tableId) === resolve) resolvers.delete(tableId); };
}

export function resolveTableRowMenuDescriptor(target: HTMLElement | null): TableRowMenuDescriptor | null {
  const row = target?.closest<HTMLElement>("[data-row-id]");
  const tableId = row?.closest<HTMLElement>("[data-matrx-table-id]")?.dataset.matrxTableId;
  const rowId = row?.dataset.rowId;
  if (!tableId || !rowId) return null;
  const token = resolvers.get(tableId)?.(rowId);
  return token && typeof token === "object" ? descriptors.get(token) ?? null : null;
}
