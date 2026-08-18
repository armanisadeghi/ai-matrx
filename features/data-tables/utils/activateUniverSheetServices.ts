import type { IWorkbookData } from "@univerjs/core";

const SHEET_SERVICE_ACTIVATION_UNIT_ID =
  "__matrx_document_sheet_service_activation__";

type WorkbookActivationApi = {
  createWorkbook(data: Partial<IWorkbookData>): unknown;
};

/**
 * Activate sheet-typed Univer plugins before a document reaches `Rendered`.
 *
 * Univer's sheets Facade installs process-global lifecycle observers as soon as
 * its module is imported, but Univer does not run sheet plugin `onStarting`
 * hooks until a workbook unit exists. A document-only instance therefore needs
 * one inert workbook unit so those observers can resolve their sheet services.
 * The document created immediately afterward remains the active visible unit;
 * the activation unit lives only until the enclosing Univer instance is
 * disposed.
 */
export function activateUniverSheetServices(
  api: WorkbookActivationApi,
  locale: IWorkbookData["locale"],
): void {
  api.createWorkbook({
    id: SHEET_SERVICE_ACTIVATION_UNIT_ID,
    sheetOrder: ["activation-sheet"],
    name: "Matrx document service activation",
    appVersion: "1",
    locale,
    styles: {},
    sheets: {
      "activation-sheet": {
        id: "activation-sheet",
        name: "Activation",
        cellData: {},
        rowCount: 1,
        columnCount: 1,
      },
    },
  });
}
