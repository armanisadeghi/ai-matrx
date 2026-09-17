import {
  buildCxCsvExport,
  buildCxJsonExport,
  buildCxSourcePageExportConfig,
} from "./export";

describe("CX source-page exports", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
  });

  afterEach(() => jest.useRealTimers());

  it("keeps the established CSV and JSON bytes and filenames in the canonical menu contract", () => {
    const rows = [
      { id: "cx-1", title: 'Needs, "quotes"', metadata: { source: "page" } },
    ];

    expect(buildCxCsvExport(rows, "conversations")).toEqual({
      content: 'id,title,metadata\ncx-1,"Needs, ""quotes""","{""source"":""page""}"',
      extension: "csv",
      filename: "cx-conversations-2026-09-17.csv",
      mime: "text/csv;charset=utf-8;",
    });
    expect(buildCxJsonExport(rows, "conversations")).toEqual({
      content: JSON.stringify(rows, null, 2),
      extension: "json",
      filename: "cx-conversations-2026-09-17.json",
      mime: "application/json",
    });

    const items = buildCxSourcePageExportConfig(rows, "conversations").items;
    expect(items.map((item) => item.label)).toEqual([
      "CSV (source page)",
      "JSON (source page)",
    ]);
    expect(items.map((item) => item.build?.())).toEqual([
      buildCxCsvExport(rows, "conversations"),
      buildCxJsonExport(rows, "conversations"),
    ]);
  });

  it("does not expose exports for an empty source page", () => {
    expect(buildCxSourcePageExportConfig([], "conversations").items).toEqual([]);
  });
});
