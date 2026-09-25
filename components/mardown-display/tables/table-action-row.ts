// The ONE class for a table's action row (Chart this, Save, Workbook, Export,
// Edit…). It ALWAYS wraps and never grows past its column: on desktop the row
// used to be `justify-end` without wrapping, so extra buttons were pushed off
// the left edge of the content column and could not be reached (verify-RC-B9 F6).

export function tableActionRowClass(isMobile: boolean): string {
  return isMobile
    ? "mt-2 flex min-w-0 max-w-full flex-wrap justify-start gap-2"
    : "mt-2 flex min-w-0 max-w-full flex-wrap justify-end gap-2";
}
