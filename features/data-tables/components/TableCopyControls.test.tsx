jest.mock("@ai-matrx/design-system/content-transfer", () => ({
  ContentTransferMenu: () => null,
  tableSchemaFormat: {},
}));

jest.mock("@ai-matrx/kit/content-transfer", () => ({
  directSource: (payload: unknown) => payload,
  normalizeTransferJson: (value: unknown) => value,
}));

jest.mock("@/components/agent-copy/useAlchemyDisclosure", () => ({
  useAlchemyDisclosure: jest.fn(),
}));

import {
  normalizeTableTransferRows,
  tableRowIdColumnId,
  tableTransferColumns,
} from "./TableCopyControls";

describe("table transfer row identity", () => {
  const fields = [
    { id: "field-id", field_name: "id", display_name: "User ID" },
    { id: "field-name", field_name: "name/with~pointer", display_name: "Name" },
    { id: "field-reserved", field_name: "__matrx_row_id", display_name: "Reserved" },
  ];

  it("keeps storage row IDs apart from a user data.id value", () => {
    expect(normalizeTableTransferRows([
      { id: "storage-row-42", data: { id: "customer-visible-id", "name/with~pointer": "Ava" } },
    ], fields)).toEqual([
      {
        id: "storage-row-42",
        data: { id: "customer-visible-id", "name/with~pointer": "Ava", __matrx_row_id: null },
      },
    ]);
  });

  it("declares an exportable Row ID column and nested data paths", () => {
    const columns = tableTransferColumns(fields, ["id"]);

    expect(tableRowIdColumnId(fields)).toBe("__matrx_row_id_2");
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "__matrx_row_id_2",
        label: "Row ID",
        path: "/id",
        visible: true,
        exportable: true,
      }),
      expect.objectContaining({ id: "id", path: "/data/id", visible: false, exportable: true }),
      expect.objectContaining({ id: "name/with~pointer", path: "/data/name~1with~0pointer", exportable: true }),
    ]));
  });
});

export {};
