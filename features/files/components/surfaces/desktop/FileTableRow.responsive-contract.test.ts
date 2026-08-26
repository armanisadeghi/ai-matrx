import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "FileTableRow.tsx"), "utf8");

describe("FileTableRow responsive action contract", () => {
  it("bounds both tablet name cells and reserves room for their action control", () => {
    expect(
      source.match(
        /max-lg:w-\[calc\(100vw-16rem\)\] max-lg:max-w-\[calc\(100vw-16rem\)\]/g,
      ),
    ).toHaveLength(2);
    expect(
      source.match(/flex min-w-0 flex-1 flex-col overflow-hidden/g),
    ).toHaveLength(2);
    expect(
      source.match(
        /flex shrink-0 items-center gap-1 pr-1 transition-opacity lg:ml-auto/g,
      ),
    ).toHaveLength(2);
  });

  it("keeps the tablet More controls at the 44px touch minimum", () => {
    expect(source.match(/className="h-11 w-11 lg:h-7 lg:w-7"/g)).toHaveLength(
      2,
    );
  });
});
