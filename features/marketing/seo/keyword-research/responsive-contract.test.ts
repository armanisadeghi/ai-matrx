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

  it("keeps the floating window controls touch-safe on phones", () => {
    const windowSource = readFileSync(
      join(
        __dirname,
        "../../../window-panels/windows/seo/KeywordResearchWindow.tsx",
      ),
      "utf8",
    );
    const mobileHeaderSource = readFileSync(
      join(__dirname, "../../../window-panels/WindowPanel/MobileHeader.tsx"),
      "utf8",
    );

    expect(windowSource).toContain(
      'SelectTrigger className="h-11 w-56 text-base sm:h-8 sm:text-xs"',
    );
    expect(windowSource).toContain("flex min-h-11 shrink-0 items-center gap-2");
    expect(mobileHeaderSource).toContain(
      "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center",
    );
  });
});
