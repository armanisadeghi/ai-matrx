/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { FeatureDocListRow } from "@/features/feature-docs/service";
import FeatureDocsTable, { filterFeatureDocRows } from "./FeatureDocsTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<FeatureDocListRow> | null = null;
const listFeatureDocs = jest.fn<Promise<FeatureDocListRow[]>, []>();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<FeatureDocListRow>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("@/features/feature-docs/service", () => ({
  listFeatureDocs: () => listFeatureDocs(),
}));

jest.mock("@/components/loaders/MatrxMiniLoader", () => () => null);

const rows: FeatureDocListRow[] = [
  {
    id: "1",
    path: "features/action-catalog/FEATURE.md",
    title: "Action catalog",
    area: "features",
    slug: "action-catalog",
    synced_at: "2026-09-01T00:00:00.000Z",
    version: 2,
  },
  {
    id: "2",
    path: "features/action-catalog/README.md",
    title: "Read me",
    area: "features",
    slug: "action-catalog-readme",
    synced_at: null,
    version: 1,
  },
  {
    id: "3",
    path: "docs/FEATURE.md",
    title: "Documentation",
    area: "docs",
    slug: "documentation",
    synced_at: null,
    version: 3,
  },
] as FeatureDocListRow[];

describe("FeatureDocsTable", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    listFeatureDocs.mockResolvedValue(rows);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.restoreAllMocks();
  });

  it("applies zone restrictions before include, exclusion, and field filters", () => {
    const result = filterFeatureDocRows(rows, "codebase", undefined, {
      pathInclude: "features/**\n!**/README.md",
      pathExclude: "",
      title: "action",
      area: "features",
      slug: "catalog",
      synced: "synced",
      version: "2",
    });

    expect(result.map((row) => row.id)).toEqual(["1"]);
  });

  it("passes the complete filtered list to the canonical local table", async () => {
    await act(async () => {
      root.render(<FeatureDocsTable zone="codebase" />);
    });

    if (!tableProps) throw new Error("Feature docs table did not render");
    expect(tableProps.pageSize).toBe(0);
    expect(tableProps.defaultSort).toEqual({ id: "path", direction: "asc" });
    expect(tableProps.getRowId(rows[0])).toBe("1");
    expect(tableProps.data.map((row) => row.id)).toEqual(["1", "2"]);
    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "path",
      "title",
      "area",
      "slug",
      "synced_at",
      "version",
    ]);
    expect(tableProps.mobileCards).toBeDefined();
    expect(tableProps.rowActions).toBeDefined();
  });
});
