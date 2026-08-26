import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Keyword Research responsive contract", () => {
  it("keeps mobile cards phone-only so portrait tablets retain the table", () => {
    const source = readFileSync(
      join(__dirname, "components/KeywordResearchWorkbench.tsx"),
      "utf8",
    );

    expect(source).toContain("mobileCards={renderMobileKeywordCard}");
    expect(source).not.toContain('mobileCardsBreakpoint="lg"');
  });
});
