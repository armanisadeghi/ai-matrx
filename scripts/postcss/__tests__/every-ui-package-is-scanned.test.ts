/**
 * Tailwind emits a utility only for a class it SCANS. An @ai-matrx package whose
 * dist ships class strings but is missing from globals.css `@source` renders
 * half-styled: its `dark:` variants vanish while the light ones survive because
 * some scanned file happens to use them (rich-content's table rows turned white
 * on hover in dark mode, 2026-10-06). Every installed @ai-matrx package with
 * Tailwind classes in its dist must be scanned.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const CLASS_STRING = /["'`][^"'`]*\b(?:dark|hover|md|sm):(?:bg|text|border)-[a-z]+-\d{2,3}/;

function hasTailwindClasses(dir: string): boolean {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasTailwindClasses(full)) return true;
    } else if (/\.(c?m?js|jsx)$/.test(entry.name) && CLASS_STRING.test(fs.readFileSync(full, "utf8"))) {
      return true;
    }
  }
  return false;
}

describe("globals.css @source", () => {
  it("scans every @ai-matrx package that ships Tailwind classes", () => {
    const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    const scoped = path.join(ROOT, "node_modules/@ai-matrx");
    const unscanned = fs
      .readdirSync(scoped)
      .filter((name) => !name.startsWith(".") && fs.existsSync(path.join(scoped, name, "dist")))
      .filter((name) => !css.includes(`@source "../node_modules/@ai-matrx/${name}/dist"`))
      .filter((name) => hasTailwindClasses(path.join(scoped, name, "dist")));
    expect(unscanned).toEqual([]);
  });
});
