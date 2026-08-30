import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Google Picker layering contract", () => {
  it("keeps the provider backdrop and dialog above every Matrx overlay", () => {
    const globals = readFileSync(
      join(__dirname, "../app/globals.css"),
      "utf8",
    );

    expect(globals).toContain(
      ".picker-dialog-bg {\n  z-index: calc(var(--z-max) - 1) !important;\n}",
    );
    expect(globals).toContain(
      ".picker-dialog {\n  z-index: var(--z-max) !important;\n}",
    );
  });
});
