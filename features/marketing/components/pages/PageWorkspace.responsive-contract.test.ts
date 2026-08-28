import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("PageWorkspace responsive contract", () => {
  it("lets the section rail shrink inside the page grid", () => {
    const source = readFileSync(join(__dirname, "PageWorkspace.tsx"), "utf8");

    expect(source).toContain('className="grid min-w-0 w-full gap-3"');
    expect(source).toContain(
      'className="sticky top-0 z-20 min-w-0 -mx-3 -mt-3',
    );
  });

  it("enforces the shared 44px touch floor at responsive breakpoints", () => {
    const source = readFileSync(join(__dirname, "PageWorkspace.tsx"), "utf8");
    const globals = readFileSync(
      join(__dirname, "../../../../app/globals.css"),
      "utf8",
    );

    expect(source).toContain(
      'className="matrx-touch-targets h-full overflow-y-auto',
    );
    expect(globals).toContain("@media (pointer: coarse), (max-width: 1023px)");
    expect(globals).toContain("min-height: 2.75rem; /* 44px */");
  });
});
