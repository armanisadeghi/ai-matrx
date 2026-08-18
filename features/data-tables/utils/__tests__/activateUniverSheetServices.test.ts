import type { IWorkbookData } from "@univerjs/core";

import { activateUniverSheetServices } from "../activateUniverSheetServices";

describe("activateUniverSheetServices", () => {
  it("creates one inert workbook unit that can start sheet plugins", () => {
    const createWorkbook = jest.fn();

    activateUniverSheetServices(
      { createWorkbook },
      "enUS" as IWorkbookData["locale"],
    );

    expect(createWorkbook).toHaveBeenCalledTimes(1);
    expect(createWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "__matrx_document_sheet_service_activation__",
        locale: "enUS",
        sheetOrder: ["activation-sheet"],
        sheets: {
          "activation-sheet": expect.objectContaining({
            id: "activation-sheet",
            rowCount: 1,
            columnCount: 1,
          }),
        },
      }),
    );
  });
});
