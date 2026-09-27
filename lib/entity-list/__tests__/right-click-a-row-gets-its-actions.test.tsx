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

jest.mock("@/components/agent-copy/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

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
import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import { contextMenuActionsFromModel } from "@/features/context-menu-v3/alchemy-provider";
import type { MenuModel, MenuNode } from "@/features/context-menu-v3/model/menu-model";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
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

/** The row sections as the menu model sees them, run through the package's heading check. */
async function buildWithHeadingCheck(sections: ContextMenuExtraSection[]) {
  const { buildMenuModel } = await import("@ai-matrx/alchemy/menu");
  const model: MenuModel = {
    header: null,
    sections: sections.map((s) => ({
      id: `extra:${s.id}`,
      group: "surface",
      label: s.label,
      primary: s.primary,
      nodes: s.items.map(
        (item) =>
          (item.kind === "separator"
            ? { kind: "separator", id: `x:${item.id}` }
            : { kind: "item", id: `x:${item.id}`, label: "label" in item ? item.label : "", onSelect: () => undefined }) as MenuNode,
      ),
    })),
    roles: {} as MenuModel["roles"],
  } as MenuModel;
  const target = createClickTarget({ host: { contextMenu: { kind: "context-menu", instanceId: "row-guard" } } });
  const registry = createActionRegistry({ ports: { diagnostics: { capture: jest.fn() } } });
  registry.register({ id: "context-menu:row-guard", tier: "T1", actions: () => contextMenuActionsFromModel(model, "row-guard") });
  return buildMenuModel(target, await registry.resolve(target), { headingPolicy: "throw" });
}

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

  it("passes the menu's approved-heading check; the unlabelled primary section it replaced does not", async () => {
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
    const unregister = registerTableRowContextResolver("right-click-guard-2", () => token);
    const table = document.createElement("div");
    table.dataset.matrxTableId = "right-click-guard-2";
    const rowTarget = document.createElement("div");
    rowTarget.dataset.rowId = ROW.id;
    table.appendChild(rowTarget);
    const sections = resolveTableRowMenuDescriptor(rowTarget)?.extraSections ?? [];
    unregister();

    await expect(buildWithHeadingCheck(sections)).resolves.toBeDefined();
    // The shape that shipped in 1c9e4a4986 and threw live ("Menu heading \"\"").
    await expect(
      buildWithHeadingCheck([{ ...sections[0], label: undefined, primary: true }]),
    ).rejects.toThrow(/not an approved heading/);
  });
});
