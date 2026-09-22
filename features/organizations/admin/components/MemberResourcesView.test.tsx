import { MEMBER_RESOURCE_COLUMNS } from "./MemberResourcesView";

describe("MemberResourcesView canonical table contract", () => {
  it("keeps every resource field independently filterable and sortable", () => {
    expect(MEMBER_RESOURCE_COLUMNS.map((column) => column.id)).toEqual([
      "type",
      "schema",
      "table",
      "count",
    ]);
    expect(MEMBER_RESOURCE_COLUMNS.map((column) => column.filter)).toEqual([
      "text",
      "text",
      "text",
      "number",
    ]);
    expect(
      MEMBER_RESOURCE_COLUMNS.find((column) => column.id === "count")?.align,
    ).toBe("right");
  });
});
