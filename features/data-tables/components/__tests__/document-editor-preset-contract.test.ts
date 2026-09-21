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

  it("states the page's own colours, not just Univer's chrome", () => {
    // Cold walk 18: a black sheet in a bright frame, in a dark app.
    // `toggleDarkMode` (useUniverDarkModeSync) only recolours Univer's chrome;
    // `@univerjs/engine-render` paints the desk and the paper from module-level
    // LIGHT constants no theme ever reaches, so the host has to say what they
    // are. The standalone sweep is `pnpm check:univer-doc-theme`; this keeps
    // the same rule inside the suite that runs on every change.
    expect(source).toContain("useUniverDarkModeSync(");
    expect(source).toContain("useUniverDocSurfaceTheme(");
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
