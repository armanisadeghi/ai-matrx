import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("PackReview responsive contract", () => {
  it("enforces the shared mobile touch floor without enlarging checkbox chrome", () => {
    const source = readFileSync(join(__dirname, "PackReview.tsx"), "utf8");

    expect(source).toContain(
      'className="matrx-touch-targets flex h-full min-h-0 flex-col"',
    );
    expect(source).toContain("const CHECKBOX_TAP_AREA =");
    expect(source).toContain('className={cn("mt-0.5", CHECKBOX_TAP_AREA)}');
  });
});
