import fs from "node:fs";
import path from "node:path";

const source = (name: string) =>
  fs.readFileSync(path.join(__dirname, name), "utf8");

describe("Code library tree responsive context-menu contract", () => {
  it("keeps every live library row touch-sized and exposes the shared menu opener", () => {
    for (const fileName of [
      "LibraryTree.tsx",
      "LibraryTreeNode.tsx",
      "SourceFolderNode.tsx",
    ]) {
      const file = source(fileName);
      expect(file).toContain('"max-lg:h-11"');
      expect(file).toContain("openContextMenuForElement");
      expect(file).toContain('aria-haspopup="menu"');
      expect(file).toContain("lg:hidden");
    }
  });

  it("wraps library source roots in the canonical v3 menu", () => {
    const sourceFolder = source("SourceFolderNode.tsx");
    expect(sourceFolder).toContain("<NonEditableContextMenu");
    expect(sourceFolder).toContain('id: "library-source-refresh"');
    expect(sourceFolder).toContain(
      "aria-label={`Actions for ${adapter.label}`}",
    );
  });
});
