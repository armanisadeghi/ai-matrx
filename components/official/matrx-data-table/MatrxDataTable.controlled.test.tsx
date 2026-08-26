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
  it("lets a hierarchy preserve domain ordering while the table keeps local pagination", () => {
    const processLocalRows = jest.fn((rows: Row[]) => [...rows].reverse());
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[
          { id: "parent", name: "Parent" },
          { id: "child", name: "Child" },
        ]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        processLocalRows={processLocalRows}
        pageSize={1}
        detail={{ enabled: false }}
      />,
    );

    expect(processLocalRows).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        page: 1,
        pageSize: 1,
        search: "",
        columnFilters: {},
        sort: null,
      }),
    );
    expect(markup).toContain("Child");
    expect(markup).not.toContain("Parent");
    expect(markup).toContain("1-1 of 2");
  });

  it("shows an explicit primary-search matching mode when enabled", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Hardware" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        query={{
          mode: "controlled",
          state: { ...CONTROLLED_STATE, searchMatchMode: "whole_words" },
          totalItems: 1,
          onStateChange: jest.fn(),
        }}
        toolbar={{ searchMatch: {} }}
        detail={{ enabled: false }}
      />,
    );

    expect(markup).toContain('aria-label="Search match: whole words"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Whole words");
  });

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

  it("keeps table-owned desktop row actions at the micro size", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        copy={{
          label: "Row",
          listLabel: "Rows",
          location: "Test table",
          rowKind: "test-row",
          listKind: "test-row-list",
          humanRow: (row) => row.name,
        }}
        detail={{}}
      />,
    );

    expect(markup).toContain("lg:h-5");
    expect(markup).toContain("lg:w-8");
    expect(markup).toContain('aria-label="Open in window"');
  });

  it("uses dense desktop body-cell padding without shrinking mobile rows", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        detail={{ enabled: false }}
      />,
    );

    expect(markup).toContain("py-1.5 align-middle lg:py-0.5");
  });

  it("adds the canonical hierarchy move handle only when configured", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        hierarchy={{
          getParentId: () => null,
          onReparent: () => undefined,
          itemLabel: (row) => row.name,
        }}
        detail={{ enabled: false }}
      />,
    );

    expect(markup).toContain('aria-label="Move Alpha"');
    expect(markup).toContain("touch-none");
    expect(markup).toContain('title="Drag to move"');
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

  it("supports an explicit phone card presentation without replacing the desktop table", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        detail={{ enabled: false }}
        mobileCards={(row) => (
          <article aria-label={`${row.name} mobile summary`}>
            Mobile {row.name}
          </article>
        )}
      />,
    );

    expect(markup).toContain('aria-label="Alpha mobile summary"');
    expect(markup).toContain("Mobile Alpha");
    expect(markup).toContain("max-sm:hidden");
    expect(markup).toContain("<table");
    expect(markup).not.toContain("max-sm:sticky");
  });

  it("hands phone cards the canonical selection state", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        detail={{ enabled: false }}
        selection={{
          selectedIds: ["row-a"],
          onSelectedIdsChange: jest.fn(),
        }}
        mobileCards={(row, _index, controls) => (
          <article data-selected={controls.selected}>Mobile {row.name}</article>
        )}
      />,
    );

    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain("1 row selected");
  });

  it("hands phone cards the canonical row actions", () => {
    const markup = renderToStaticMarkup(
      <MatrxDataTable
        data={[{ id: "row-a", name: "Alpha" }]}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        detail={{ enabled: false }}
        copy={{
          label: "Record",
          location: "Test",
          rowKind: "test-record",
          listKind: "test-record-list",
          humanRow: (row) => row.name,
        }}
        mobileCards={(row, _index, controls) => (
          <article>
            Mobile {row.name}
            {controls.actions}
          </article>
        )}
      />,
    );

    expect(markup).toContain("Mobile Alpha");
    expect(markup).toContain("Copy Record");
  });
});
