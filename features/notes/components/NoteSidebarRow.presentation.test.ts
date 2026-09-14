const { readFileSync } = require("node:fs") as typeof import("node:fs");
const { join } = require("node:path") as typeof import("node:path");

const source = readFileSync(
  join(__dirname, "NoteSidebarRow.tsx"),
  "utf8",
);

describe("NoteSidebarRow presentation", () => {
  it("keeps every note on the canonical compact ItemRow geometry", () => {
    expect(source).toContain('<ItemRow\n          sourceFeature="notes"');
    expect(source).toContain('size="sm"');
    expect(source).not.toContain("secondaryLabel=");
    expect(source).not.toContain("<CopyButtons");
  });
});
