/**
 * RIGHT-CLICK A ROW → THAT ROW'S ACTIONS, in the table view of every list.
 *
 * 🚨 THE DEFECT (page-pass /research/topics, live 2026-09-27). The kebab showed
 * Open / Settings / Copy link / Delete, but right-clicking the same row showed
 * only the universal menu (Select All, Compare…). The table registers a
 * row-menu resolver for every row, and a registered row descriptor WINS over
 * the shell's ItemContextMenu resolution; the descriptor carried only the
 * table's edit commands (and was only built when a surface overrode
 * `getRowAgentContext`), so the row's own actions were never in it — on every
 * EntityListPage in table view.
 *
 * RED against the pre-fix shell: `contextMenu` is undefined for a config with
 * no `getRowAgentContext`, and when present its sections hold no row action.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let capturedTableProps: Record<string, unknown> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: Record<string, unknown>) => {
    capturedTableProps = props;
    return null;
  },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { EntityListTable } from "../components/EntityListTable";
import type { EntityListConfig, EntityRowActions } from "../config";
import {
  registerTableRowContextResolver,
  resolveTableRowMenuDescriptor,
} from "@/features/context-menu-v3/table-row-context-registry";

interface Row {
  id: string;
  name: string;
}

const ROW: Row = { id: "r2", name: "E-waste Manual Sort Decider" };

const CONFIG = {
  surfaceKey: "right-click-guard",
  entityLabel: { singular: "rulebook", plural: "rulebooks" },
  scopes: ["mine"],
  sourceFeature: "masterwork",
  supportsArchived: false,
  columns: [
    {
      id: "name",
      label: "Name",
      locked: true,
      column: { id: "name", header: "Name", cell: (r: Row) => r.name },
    },
  ],
  prefsVersion: 1,
  getRowId: (row: Row) => row.id,
  getRowName: (row: Row) => row.name,
  emptyState: { title: "No rulebooks yet", description: "Make one." },
} as unknown as EntityListConfig<Row>;

const ACTIONS: EntityRowActions<Row> = {
  menuFor: (row) => () => ({
    sections: [
      { id: "open", items: [{ id: "open", label: "Open this rulebook", onSelect: () => undefined }] },
      { id: "danger", items: [{ id: "delete", label: `Delete ${row.name}`, onSelect: () => undefined }] },
    ],
  }),
  onOpenRow: () => undefined,
};

describe("right-clicking a table row", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    capturedTableProps = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers that row's own actions first, under the one Row heading", () => {
    act(() => {
      root.render(
        <EntityListTable
          config={CONFIG}
          actions={ACTIONS}
          rows={[ROW]}
          total={1}
          page={1}
          pageSize={25}
          sort="name"
          direction="asc"
          filters={{}}
          facets={{ byKind: {} }}
          isLoading={false}
          isFetching={false}
          density="compact"
          showSharedColumns={false}
          hiddenColumns={[]}
          onSaveEdits={async () => undefined}
          onQueryChange={() => undefined}
        />,
      );
    });

    const contextMenu = capturedTableProps?.contextMenu as
      | { resolveRowContext?: (row: Row, controls: object) => unknown }
      | undefined;
    const token = contextMenu?.resolveRowContext?.(ROW, {});
    expect(token).toBeDefined();

    const unregister = registerTableRowContextResolver("right-click-guard", () => token);
    const table = document.createElement("div");
    table.dataset.matrxTableId = "right-click-guard";
    const rowTarget = document.createElement("div");
    rowTarget.dataset.rowId = ROW.id;
    table.appendChild(rowTarget);
    const descriptor = resolveTableRowMenuDescriptor(rowTarget);
    unregister();

    const labels = (descriptor?.extraSections ?? []).flatMap((s) =>
      s.items.map((item) => ("label" in item ? item.label : "")),
    );
    expect(labels).toContain("Open this rulebook");
    expect(labels).toContain("Delete E-waste Manual Sort Decider");
    // One primary section under the approved "Row" heading — a primary section
    // with no heading throws in the menu's heading check (live, 2026-09-27).
    expect(descriptor?.extraSections[0]).toMatchObject({ label: "Row", primary: true });
    expect(descriptor?.extraSections.filter((s) => s.primary)).toHaveLength(1);
  });
});
