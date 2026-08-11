import { renderToStaticMarkup } from "react-dom/server";
import { MatrxDataTable } from "./MatrxDataTable";
import type { MatrxColumnDef, MatrxDataTableQueryState } from "./types";

interface Row {
  id: string;
  name: string;
}

const COLUMNS: MatrxColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name", filter: "text" },
];

const CONTROLLED_STATE: MatrxDataTableQueryState = {
  page: 2,
  pageSize: 2,
  search: "does-not-match-this-page",
  anyOf: "",
  columnFilters: {},
  sort: null,
};

describe("MatrxDataTable controlled mode", () => {
  it("renders the supplied remote page without filtering or slicing it again", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[
          { id: "row-a", name: "Alpha" },
          { id: "row-b", name: "Beta" },
        ]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        isFetching
        query={{
          mode: "controlled",
          state: CONTROLLED_STATE,
          totalItems: 200,
          onStateChange: jest.fn(),
        }}
        detail={{ enabled: false }}
      />,
    );

    expect(markup).toContain("Alpha");
    expect(markup).toContain("Beta");
    expect(markup).toContain("3-4 of 200");
    expect(markup).toContain("Refreshing table data");
    expect(markup).toContain('aria-busy="true"');
  });

  it("preserves local pagination when the controlled contract is omitted", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[
          { id: "row-a", name: "Alpha" },
          { id: "row-b", name: "Beta" },
        ]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        pageSize={1}
        detail={{ enabled: false }}
      />,
    );

    expect(markup).toContain("Alpha");
    expect(markup).not.toContain("Beta");
    expect(markup).toContain("1-1 of 2");
  });
});

describe("MatrxDataTable accessibility & mobile presentation", () => {
  it("names icon-only controls and reports sort state", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        query={{
          mode: "controlled",
          state: {
            ...CONTROLLED_STATE,
            page: 1,
            sort: { id: "name", direction: "asc" },
          },
          totalItems: 1,
          onStateChange: jest.fn(),
        }}
        detail={{}}
      />,
    );

    expect(markup).toContain('aria-sort="ascending"');
    // (The header filter trigger's `Sort or filter <column>` aria-label lives
    // inside a Radix Popover trigger, which does not render in static markup —
    // covered by browser verification instead.)
    // CONTROLLED_STATE carries a non-empty search → the clear X renders.
    expect(markup).toContain('aria-label="Clear search"');
    // detail enabled → the row panel-icon renders.
    expect(markup).toContain('aria-label="Open in window"');
  });

  it("exposes the adjustable side panel as the secondary action in window-first mode", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        detail={{}}
        window={{ openOnRowClick: true }}
      />,
    );

    expect(markup).toContain('aria-label="Open in side panel"');
    expect(markup).not.toContain('aria-label="Open in window"');
  });

  it("freezes the first (identity) column below sm by default", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        detail={{ enabled: false }}
      />,
    );
    expect(markup).toContain("max-sm:sticky");
  });

  it('mobile="plain" opts out of the frozen first column', () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        detail={{ enabled: false }}
        mobile="plain"
      />,
    );
    expect(markup).not.toContain("max-sm:sticky");
  });
});
