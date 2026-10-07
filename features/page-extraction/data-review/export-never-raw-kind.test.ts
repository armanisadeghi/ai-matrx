/**
 * An extraction export a person opens (CSV, XLSX, TSV, markdown table) never
 * holds raw `{"__kind":…}` JSON. The explicit "JSON" download stays data.
 */
import { readWorkbook } from "@ai-matrx/alchemy/operate/read";
import { cellToString, toCSV, toJSON, toMarkdownTable, toMatrix, toTSV, toXLSXBlob } from "./export";

const KIND = { __kind: "checklist", title: "Packing", items: [{ text: "Passport" }] };
const columns = [
  { key: "answer", label: "Answer" },
  { key: "obj", label: "Object" },
  { key: "plain", label: "Plain" },
];
const rows = [
  {
    answer: `Here you go:\n\n\`\`\`json\n${JSON.stringify(KIND)}\n\`\`\``,
    obj: KIND,
    plain: "just text",
  },
  { answer: JSON.stringify(KIND), obj: { a: 1 }, plain: "x" },
];

describe("extraction exports never hand a person raw kind JSON", () => {
  it("fixture sentinel: the raw stringifier (the old export path) leaks the kind", () => {
    expect(cellToString(rows[0].obj)).toContain("__kind");
    expect(cellToString(rows[1].answer)).toContain("__kind");
  });
  it("toMatrix / CSV / TSV / markdown table carry the kind's markdown", () => {
    for (const out of [toMatrix(columns, rows).flat().join("\n"), toCSV(columns, rows), toTSV(columns, rows), toMarkdownTable(columns, rows)]) {
      expect(out).not.toContain("__kind");
      expect(out).toContain("Passport");
    }
  });
  it("XLSX cells (toXLSXBlob builds its sheet from toMatrix) are the kind's markdown", async () => {
    const blob = await toXLSXBlob(columns, rows);
    // jsdom's Blob has no arrayBuffer(); FileReader reads the same bytes.
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const book = await readWorkbook(new Uint8Array(bytes));
    const text = JSON.stringify(book.sheets[0]!.grid());
    expect(text).not.toContain("__kind");
    expect(text).toContain("Passport");
  });
  it("kindless cells are untouched", () => {
    expect(toMatrix(columns, rows)[1][2]).toBe("just text");
    expect(toMatrix(columns, rows)[2][1]).toBe('{"a":1}');
  });
  it("the explicit JSON download stays data", () => {
    expect(toJSON(columns, rows)).toContain("__kind");
  });
});
