import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "..", "DocumentEditor.tsx"),
  "utf8",
);

describe("DocumentEditor Univer preset contract", () => {
  it("registers sheets services before docs for mixed-editor SPA sessions", () => {
    const sheetsPreset = source.indexOf("UniverSheetsCorePreset({");
    const docsPreset = source.indexOf("UniverDocsCorePreset({");

    expect(sheetsPreset).toBeGreaterThan(-1);
    expect(docsPreset).toBeGreaterThan(sheetsPreset);
    expect(source).toContain(
      'import "@univerjs/preset-sheets-core/lib/index.css";',
    );
    expect(source).toContain("merge({}, sheetsCoreEnUS, docsCoreEnUS)");
  });
});
