import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("TopicExperts responsive contract", () => {
  it("uses the shared action floor and compact-checkbox hit areas", () => {
    const source = readFileSync(join(__dirname, "TopicExperts.tsx"), "utf8");
    const globals = readFileSync(
      join(__dirname, "../../../../app/globals.css"),
      "utf8",
    );

    expect(source).toContain(
      'className="matrx-touch-targets h-full overflow-y-auto',
    );
    expect(source).toContain("const CHECKBOX_TAP_AREA =");
    expect(source).toContain("max-lg:before:h-11 max-lg:before:w-11");
    expect(globals).toContain("min-height: 2.75rem; /* 44px */");
  });
});
