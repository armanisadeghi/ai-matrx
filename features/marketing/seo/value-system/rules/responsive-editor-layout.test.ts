import { readFileSync } from "node:fs";
import { join } from "node:path";

const rulesDir = join(
  process.cwd(),
  "features/marketing/seo/value-system/rules",
);

describe("value editor responsive layout", () => {
  test.each([
    "ValueRuleEditor.tsx",
    "GeoAreaEditor.tsx",
    "ValueComboEditor.tsx",
  ])(
    "%s uses one mobile scroll area and independent desktop panes",
    (fileName) => {
      const source = readFileSync(join(rulesDir, fileName), "utf8");

      expect(source).toContain(
        "grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto",
      );
      expect(source).toContain("md:overflow-hidden");
      expect(
        source.match(/overflow-visible[^\"]*md:overflow-y-auto/g),
      ).toHaveLength(2);
    },
  );

  test("pack provenance gives its explanation the full mobile row", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/marketing/seo/value-system/ProvenanceStrip.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("flex-col items-stretch");
    expect(source).toContain("sm:flex-row sm:items-center");
    expect(source).toContain("w-full min-w-0");
  });
});
