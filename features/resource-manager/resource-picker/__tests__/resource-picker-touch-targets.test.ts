import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "../ResourcePickerMenu.tsx"),
  "utf8",
);
const tiles = readFileSync(join(__dirname, "../ResourcePickerTiles.tsx"), "utf8");

describe("ResourcePickerMenu responsive touch targets", () => {
  it("keeps the search row and every menu row at 44px through tablet widths", () => {
    // Search your knowledge (⌘K hand-off).
    expect(source).toMatch(/"flex h-11 w-full shrink-0 items-center[^"]*lg:h-10"/);
    // PickerMenuRow — every resource row, Settings and Debug render through it.
    expect(source).toMatch(/className="group flex h-11 w-full[^"]*lg:h-9"/);
    expect(source.match(/<PickerMenuRow\b/g)?.length).toBe(3);
  });

  it("keeps the quick tiles taller than 44px", () => {
    expect(tiles).toMatch(/min-h-\[4\.25rem\]/);
    expect(tiles).toMatch(/min-h-16/);
  });
});
