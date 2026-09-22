/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import { listOrgCosts } from "../service/kgCostService";
import { KgCostDashboard } from "./KgCostDashboard";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const tables = new Map<string, MatrxDataTableProps<unknown>>();

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<unknown>) => {
    if (props.tableId) tables.set(props.tableId, props);
    return null;
  },
}));

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("@/features/organizations/hooks/useOrgAutoRagPreference", () => ({
  useOrgAutoRagPreference: () => ({ enabled: false, loading: false }),
}));

jest.mock("../service/kgCostService", () => ({
  getKgCostSummary: jest.fn(() => new Promise(() => {})),
  listOrgCosts: jest.fn(() => new Promise(() => {})),
  listPendingBatches: jest.fn(() => new Promise(() => {})),
  fetchUnitEconomics: jest.fn(() => new Promise(() => {})),
}));

function table(id: string): MatrxDataTableProps<unknown> {
  const props = tables.get(id);
  if (!props) throw new Error(`Missing table ${id}`);
  return props;
}

describe("KgCostDashboard canonical tables", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tables.clear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps all four bounded dashboard grids canonical and honestly scoped", () => {
    act(() => root.render(<KgCostDashboard />));

    for (const [id, title, answeredBy] of [
      ["administration/kg-cost/by-source-kind", "By source kind", "source"],
      ["administration/kg-cost/recent-runs", "Recent runs", "client"],
      ["administration/kg-cost/organizations", "Organizations", "source"],
      ["administration/kg-cost/pending-batches", "In-flight batches", "source"],
    ]) {
      const props = table(id);
      expect(props.density).toBe("condensed");
      expect(props.stickyHeader).toBe(true);
      expect(props.hidePagination).toBe(true);
      expect(props.pageSize).toBe(0);
      expect(props.toolbar?.search).toBe(true);
      expect(props.toolbar?.title).toBe(title);
      expect(props.detail).toEqual({ enabled: false });
      expect(props.window).toEqual({ enabled: false });
      expect(props.coverage).toMatchObject({ answeredBy });
    }
  });

  it("keeps separately filterable run totals, chunks, cost stages, and exactness", () => {
    act(() => root.render(<KgCostDashboard />));

    const sourceKindColumns = table(
      "administration/kg-cost/by-source-kind",
    ).columns;
    expect(sourceKindColumns.map((column) => column.accessorKey)).toEqual(
      expect.arrayContaining([
        "runs",
        "successes",
        "errors",
        "skips",
        "embedding_cost_usd",
        "extraction_cost_usd",
        "cleanup_cost_usd",
        "enrichment_cost_usd",
      ]),
    );
    expect(
      sourceKindColumns
        .filter((column) =>
          ["runs", "successes", "errors", "skips"].includes(
            column.accessorKey ?? "",
          ),
        )
        .every((column) => column.filter === "number"),
    ).toBe(true);

    const runColumns = table("administration/kg-cost/recent-runs").columns;
    expect(table("administration/kg-cost/recent-runs").coverage).toMatchObject({
      cap: 50,
    });
    expect(
      table("administration/kg-cost/organizations").coverage,
    ).toMatchObject({ cap: 200 });
    expect(
      table("administration/kg-cost/pending-batches").coverage,
    ).toMatchObject({ cap: 100 });
    expect(runColumns.map((column) => column.accessorKey)).toEqual(
      expect.arrayContaining([
        "source_kind",
        "chunks_written",
        "chunks_reused",
        "cost_is_exact",
        "embedding_cost_usd",
        "extraction_cost_usd",
        "cleanup_cost_usd",
        "enrichment_cost_usd",
      ]),
    );
    expect(
      runColumns.find((column) => column.accessorKey === "cost_is_exact")
        ?.filter,
    ).toBe("boolean");
    expect(runColumns.find((column) => column.id === "source_id")?.filter).toBe(
      "text",
    );
  });

  it("preserves the organization and batch inspectors as row-open actions", () => {
    act(() => root.render(<KgCostDashboard />));

    const organization = table("administration/kg-cost/organizations");
    const batch = table("administration/kg-cost/pending-batches");
    expect(organization.onRowOpen).toEqual(expect.any(Function));
    expect(batch.onRowOpen).toEqual(expect.any(Function));
    expect(organization.rowActions).toEqual(expect.any(Function));
    expect(batch.rowActions).toEqual(expect.any(Function));
  });

  it("surfaces an organization-read failure with a retry while retaining the table", async () => {
    jest
      .mocked(listOrgCosts)
      .mockRejectedValueOnce(new Error("Organization receipt unavailable"));

    await act(async () => {
      root.render(<KgCostDashboard />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain("Organization receipt unavailable");
    expect(host.textContent).toContain("Retry");
    expect(table("administration/kg-cost/organizations").data).toEqual([]);
  });
});
