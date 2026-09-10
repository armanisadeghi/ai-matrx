import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildToolRendererScope } from "./toolRendererScope";

describe("dynamic React icon bundle contract", () => {
  it("never creates an async lucide-react namespace barrel", () => {
    for (const relativePath of [
      "features/dynamic-react/toolRendererScope.ts",
      "utils/icons/icon-mapper.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source).not.toMatch(/import\(["']lucide-react["']\)/);
    }
  });

  it("loads the extracted input, sheet, popover, and skeleton capabilities", async () => {
    const scope = await buildToolRendererScope([
      "@/components/ui/input",
      "@/components/ui/sheet",
      "@/components/ui/popover",
      "@/components/ui/skeleton",
    ]);

    for (const name of [
      "Input",
      "Sheet",
      "SheetContent",
      "Popover",
      "PopoverContent",
      "Skeleton",
    ]) {
      expect(scope[name]).toBeTruthy();
    }

    expect(
      renderToStaticMarkup(
        createElement(scope.Skeleton, { className: "h-4 w-12" }),
      ),
      // `.matrx-pulse`, not Tailwind's `animate-pulse`: the C9 design-system
      // swap moved Skeleton's keyframes into @ai-matrx/design-system/styles.css.
    ).toContain("matrx-pulse");
  });
});
