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
  const measureHostSource = readFileSync(
    join(
      componentsDirectory,
      "../../../cms/components/measure/CmsPageMeasureLazy.tsx",
    ),
    "utf8",
  );
  const pageEditorSource = readFileSync(
    join(componentsDirectory, "../../../cms/components/PageEditor.tsx"),
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
      'from "@/features/cms/components/measure/CmsPageMeasureLazy"',
    );
    expect(windowSource).not.toContain(
      'from "@/features/cms/components/measure/CmsPageMeasure"',
    );
    expect(measureHostSource).toContain(
      'lazy(() => import("./CmsPageMeasure"))',
    );
    expect(pageEditorSource).toContain("<CmsPageMeasureLazy");
    expect(pageEditorSource).not.toContain(
      'lazy(() => import("./measure/CmsPageMeasure"))',
    );
  });
});
