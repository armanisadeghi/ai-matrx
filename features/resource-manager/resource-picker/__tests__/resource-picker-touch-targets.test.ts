import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(__dirname, "../ResourcePickerMenu.tsx"),
  "utf8",
);

describe("ResourcePickerMenu responsive touch targets", () => {
  it("keeps every top-level action at 44px through tablet widths", () => {
    const responsiveRowClasses = source.match(
      /h-11 w-full justify-start rounded-none px-2 py-0 text-xs hover:bg-muted\/60 lg:h-6/g,
    );

    expect(responsiveRowClasses).toHaveLength(3);
  });
});
