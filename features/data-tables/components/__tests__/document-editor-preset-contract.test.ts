import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "..", "DocumentEditor.tsx"),
  "utf8",
);

describe("DocumentEditor Univer preset contract", () => {
  it("keeps the visible editor document-only", () => {
    expect(source).toContain("UniverDocsCorePreset({");
    expect(source).not.toContain("UniverSheetsCorePreset({");
    expect(source).not.toContain(
      'import "@univerjs/preset-sheets-core/lib/index.css";',
    );
    expect(source).toContain("merge({}, docsCoreEnUS)");
  });

  it("registers global sheets Facade dependencies before creating the document", () => {
    const registration = source.indexOf("registerUniverFacadeDependencies(");
    const documentCreation = source.indexOf("fb.createUniverDoc?.(initial)");

    expect(source).toContain("HoverManagerService");
    expect(source).toContain("DragManagerService");
    expect(registration).toBeGreaterThan(-1);
    expect(documentCreation).toBeGreaterThan(registration);
  });
});
