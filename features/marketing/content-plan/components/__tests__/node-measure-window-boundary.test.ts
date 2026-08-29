import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Node measurement window bundle boundary", () => {
  const componentsDirectory = join(__dirname, "..");
  const cardSource = readFileSync(
    join(componentsDirectory, "NodeMeasureCard.tsx"),
    "utf8",
  );
  const windowSource = readFileSync(
    join(componentsDirectory, "NodeMeasureWindow.tsx"),
    "utf8",
  );

  it("keeps WindowPanel and the measured workspace behind one dynamic edge", () => {
    expect(cardSource).toContain('dynamic(() => import("./NodeMeasureWindow")');
    expect(cardSource).toContain("windowOpen && webPageId");
    expect(cardSource).not.toContain(
      'from "@/features/window-panels/WindowPanel"',
    );
    expect(cardSource).not.toContain(
      'from "@/features/cms/components/measure/CmsPageMeasure"',
    );

    expect(windowSource).toContain(
      'from "@/features/window-panels/WindowPanel"',
    );
    expect(windowSource).toContain(
      'from "@/features/cms/components/measure/CmsPageMeasure"',
    );
  });
});
