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
