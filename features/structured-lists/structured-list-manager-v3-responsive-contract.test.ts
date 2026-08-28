import fs from "node:fs";
import path from "node:path";

describe("StructuredListManagerV3 responsive list-row actions", () => {
  it("wraps each sidebar row in the universal menu with a 44px touch opener", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "structured-list-manager-v3.tsx"),
      "utf8",
    );

    expect(source).toContain("<NonEditableContextMenu");
    expect(source).toContain('type: "structured_list"');
    expect(source).toContain("openContextMenuForElement");
    expect(source).toContain(
      'className="h-11 w-11 shrink-0 rounded-sm p-0 lg:hidden"',
    );
    expect(source).toContain(
      'aria-label={`Actions for ${l.list_name || "Untitled list"}`}',
    );
  });
});
