/**
 * The stacked-card table layout has exactly ONE definition: a container query on
 * `.phone-stack` in @ai-matrx/design-system/web-theme.css (matrx-frontend carries no copy). A second copy (a viewport media query, or
 * Tailwind arbitrary-variant classes per renderer) drifts — it did, once.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("phone-stack card list", () => {
  const css = read("node_modules/@ai-matrx/design-system/dist/web-theme.css");

  it("is not redefined in the host stylesheet", () => {
    expect(read("app/globals.css")).not.toContain(".phone-stack");
  });

  it("is keyed on the wrapper's width, never on the viewport", () => {
    expect(css).toMatch(/@container \(width < 480px\)\s*\{\s*\.phone-stack > table,/);
    const viewportCopies = css
      .split(/@media[^{]*\{/)
      .slice(1)
      .filter((block) => block.slice(0, 400).includes(".phone-stack"));
    expect(viewportCopies).toEqual([]);
    expect(css.match(/\.phone-stack > table > thead \{/g)).toHaveLength(1);
  });

  it("is width-defined: a size container has no intrinsic width and collapses to 0 in a content-sized parent", () => {
    const rule = css.match(/\.phone-stack \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("container-type: inline-size");
    expect(rule).toMatch(/width:\s*100%/);
  });

  it("has no per-renderer class copy of it", () => {
    for (const f of [
      "node_modules/@ai-matrx/rich-content/dist/display/tables/table-viewer.js",
      "node_modules/@ai-matrx/rich-content/dist/display/tables/MarkdownTable.js",
      "node_modules/@ai-matrx/rich-content/dist/display/blocks/table/StreamingTableRenderer.js",
    ]) {
      const src = read(f);
      expect(src).not.toContain("CANVAS_STACK_CARDS");
      expect(src).not.toContain("[&>table>thead]:hidden");
    }
  });
});
