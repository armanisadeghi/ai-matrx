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

  it("keeps the persisted file and folder menus operationally complete", () => {
    const treeNode = source("LibraryTreeNode.tsx");
    for (const actionId of [
      "library-file-open",
      "library-file-properties",
      "library-file-rename",
      "library-file-delete",
      "library-file-copy-path",
      "library-file-refresh",
      "library-folder-new-file",
      "library-folder-new-folder",
      "library-folder-properties",
      "library-folder-rename",
      "library-folder-delete",
      "library-folder-copy-path",
      "library-folder-refresh",
    ]) {
      expect(treeNode).toContain(`id: "${actionId}"`);
    }
  });

  it("keeps the tablet explorer at or above the twelve-rem floor", () => {
    const layout = fs.readFileSync(
      path.join(__dirname, "../../layout/WorkspaceLayout.tsx"),
      "utf8",
    );
    expect(layout).toContain('minSize="calc(12rem + 1px)"');
  });
});
