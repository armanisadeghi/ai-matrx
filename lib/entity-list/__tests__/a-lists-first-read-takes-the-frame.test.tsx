/**
 * A LIST'S FIRST READ TAKES THE FRAME (STABLE-2, /data home: the pager sat 400px above where it ended up,
 * because the loading table held six skeleton rows under a page of 25). EntityListTable hands the
 * package `loadingRows="fill"` while loading, so the footer is in its final place in the first frame.
 * Break: the prop absent (the package default is six rows) → red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@ai-matrx/rich-content/utils/alchemy-icon-keys", () => ({ registerAlchemyIcon: () => "app:Icon" }));

let capturedTableProps: Record<string, unknown> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: Record<string, unknown>) => {
    capturedTableProps = props;
    return null;
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { EntityListTable } from "../components/EntityListTable";
import type { EntityListConfig, EntityRowActions } from "../config";

interface Row {
  id: string;
  name: string;
}

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


it("a list loading its first page asks for the frame's full height", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <EntityListTable
        config={CONFIG}
        actions={ACTIONS}
        rows={[]}
        total={0}
        page={1}
        pageSize={25}
        sort="name"
        direction="asc"
        filters={{}}
        facets={{ byKind: {} }}
        isLoading
        isFetching={false}
        density="compact"
        showSharedColumns={false}
        hiddenColumns={[]}
        onSaveEdits={async () => undefined}
        onQueryChange={() => undefined}
      />,
    );
  });
  expect(capturedTableProps?.loadingRows).toBe("fill");
  act(() => root.unmount());
  container.remove();
});
