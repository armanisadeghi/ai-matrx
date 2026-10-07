import { csvExportItem, rowsToCsv } from "./export";

/**
 * AP-2: the Export menu's .csv is a DOWNLOAD a person opens in a spreadsheet, so a cell that opens
 * like a formula is guarded with a leading `'`. Only an AI/parser reader opts out, by name. Break:
 * give `csvExportItem` (or `rowsToCsv`'s default) `spreadsheetSafe: false` and the first case fails.
 */
const ROWS = [{ name: '=HYPERLINK("http://evil.example","click")', n: -5 }];

describe("the .csv download is formula-guarded; the AI text opts out by name", () => {
  it("guards a =HYPERLINK cell in the downloaded file, never a real number", () => {
    const built = csvExportItem(ROWS).build!();
    expect(built.mime).toBe("text/csv");
    expect(built.content).toBe(`name,n\n"'=HYPERLINK(""http://evil.example"",""click"")",-5`);
  });
  it("rowsToCsv is guarded by default; { spreadsheetSafe: false } keeps the cell as stored (an AI reads it)", () => {
    expect(rowsToCsv(ROWS)).toContain(`"'=HYPERLINK(`);
    expect(rowsToCsv(ROWS, undefined, { spreadsheetSafe: false })).toBe(`name,n\n"=HYPERLINK(""http://evil.example"",""click"")",-5`);
  });
});
