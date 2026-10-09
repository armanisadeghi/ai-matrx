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

    // The site picker's touch geometry is owned by the design system's control
    // (matrx-tap-lock holds it with !important), so the window sets width only;
    // a hand-sized height/text class here would fight the lock.
    expect(windowSource).toContain('<SelectTrigger className="w-56">');
    expect(windowSource).not.toMatch(/<SelectTrigger className="[^"]*\bh-\d/);
    expect(windowSource).toContain("flex min-h-11 shrink-0 items-center gap-2");
    expect(mobileHeaderSource).toContain(
      "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center",
    );
  });
});
