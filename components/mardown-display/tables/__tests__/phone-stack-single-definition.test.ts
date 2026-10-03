/**
 * The stacked-card table layout has exactly ONE definition: a container query on
 * `.phone-stack` in app/globals.css. A second copy (a viewport media query, or
 * Tailwind arbitrary-variant classes per renderer) drifts — it did, once.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("phone-stack card list", () => {
  const css = read("app/globals.css");

  it("is keyed on the wrapper's width, never on the viewport", () => {
    expect(css).toMatch(/@container \(width < 480px\)\s*\{\s*\.phone-stack > table,/);
    const viewportCopies = css
      .split(/@media[^{]*\{/)
      .slice(1)
      .filter((block) => block.slice(0, 400).includes(".phone-stack"));
    expect(viewportCopies).toEqual([]);
    expect(css.match(/\.phone-stack > table > thead \{/g)).toHaveLength(1);
  });

  it("has no per-renderer class copy of it", () => {
    for (const f of [
      "components/mardown-display/tables/table-viewer.ts",
      "components/mardown-display/tables/MarkdownTable.tsx",
      "components/mardown-display/blocks/table/StreamingTableRenderer.tsx",
    ]) {
      const src = read(f);
      expect(src).not.toContain("CANVAS_STACK_CARDS");
      expect(src).not.toContain("[&>table>thead]:hidden");
    }
  });
});
