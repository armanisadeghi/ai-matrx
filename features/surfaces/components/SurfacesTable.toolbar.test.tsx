/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { SurfaceWithStats } from "@/features/surfaces/services/surfaces.service";
import { DEFAULT_FILTER_STATE } from "./SurfacesFilterBar";
import { SurfacesTable, type RegistryAction } from "./SurfacesTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<SurfaceWithStats> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<SurfaceWithStats>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
jest.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
jest.mock("./SurfacesFilterBar", () => ({
  DEFAULT_FILTER_STATE: {
    status: "all",
    client: "__all__",
    manifest: "all",
    parent: "__all__",
    readiness: "all",
    checked: "all",
  },
  SurfacesFilterBar: () => null,
}));

const row = { name: "surface-a", label: "Surface A" } as SurfaceWithStats;
const registryActions: RegistryAction[] = [
  {
    key: "review",
    label: "Review registry",
    icon: () => null,
    badge: 2,
    onClick: jest.fn(),
  },
];

describe("SurfacesTable mobile toolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("moves the full registry count into the footer without losing phone controls", () => {
    act(() => {
      root.render(
        <SurfacesTable
          rows={[row]}
          isLoading={false}
          selectedName={null}
          manifestedSurfaceNames={new Set()}
          onSelect={jest.fn()}
          onEdit={jest.fn()}
          onPeek={jest.fn()}
          onDelete={jest.fn()}
          onToggleActive={jest.fn()}
          navigatingName={null}
          filters={DEFAULT_FILTER_STATE}
          onFilterChange={jest.fn()}
          onClearFilters={jest.fn()}
          clientNames={[]}
          parentNames={[]}
          onRefresh={jest.fn()}
          onAdd={jest.fn()}
          totalCount={3}
          registryActions={registryActions}
        />,
      );
    });

    if (!tableProps) throw new Error("Surfaces table did not render");
    expect(tableProps.toolbar?.titleCount).toBeUndefined();
    expect(tableProps.toolbar).toMatchObject({
      search: true,
      columns: false,
      overflow: { mode: "menu" },
      refresh: { onRefresh: expect.any(Function) },
      add: { onAdd: expect.any(Function) },
    });
    expect(tableProps.toolbar?.overflow?.pinned).toBeDefined();
    expect(tableProps.toolbar?.overflow?.sheetExtras).toHaveLength(1);
    expect(tableProps.paginationLabelFormat?.(1, 1, 1)).toBe(
      "1–1 of 1 matching · 3 surfaces",
    );
    expect(tableProps.paginationLabelFormat?.(0, 0, 0)).toBe(
      "0 matching · 3 surfaces",
    );
    expect(tableProps.paginationLabelFormat?.(1, 3, 3)).toBe("1-3 of 3");
  });

  it("uses the canonical empty footer when the registry is empty", () => {
    act(() => {
      root.render(
        <SurfacesTable
          rows={[]}
          isLoading={false}
          selectedName={null}
          manifestedSurfaceNames={new Set()}
          onSelect={jest.fn()}
          onEdit={jest.fn()}
          onPeek={jest.fn()}
          onDelete={jest.fn()}
          onToggleActive={jest.fn()}
          navigatingName={null}
          filters={DEFAULT_FILTER_STATE}
          onFilterChange={jest.fn()}
          onClearFilters={jest.fn()}
          clientNames={[]}
          parentNames={[]}
          onRefresh={jest.fn()}
          onAdd={jest.fn()}
          totalCount={0}
          registryActions={[]}
        />,
      );
    });

    if (!tableProps) throw new Error("Surfaces table did not render");
    expect(tableProps.paginationLabelFormat?.(0, 0, 0)).toBe("0 surfaces");
  });
});
