import { readFileSync } from "node:fs";
import { join } from "node:path";

const componentSource = (name: string) =>
  readFileSync(join(__dirname, "components", name), "utf8");

describe("Entity List responsive contract", () => {
  it("keeps phone toolbar controls at least 44px in both dimensions", () => {
    expect(componentSource("EntityScopeTabs.tsx")).toContain(
      "min-w-11 justify-center rounded-l-none",
    );
    expect(componentSource("EntityColumnPicker.tsx")).toContain(
      "h-11 min-w-11 items-center justify-center",
    );
    expect(componentSource("EntityListToolbar.tsx")).toContain(
      "flex h-12 min-w-0 flex-1",
    );
  });

  // list-shell fix D (2026-09-28): at 375px the saved-view strip was squeezed
  // to "Defau…" and its "+" ran off-screen. Below sm the table controls take
  // the full row and the strip is not capped at 14rem. (Live proof: page:look
  // phone views of /education/quizzes and /education/flashcards.)
  it("gives the phone's view tabs a full-width line, uncapped", () => {
    const toolbar = componentSource("EntityListToolbar.tsx");
    expect(toolbar).toContain("max-sm:basis-full");
    expect(toolbar).toContain("sm:[&_[data-matrx-table-toolbar-tabs]]:max-w-[14rem]");
    expect(toolbar).not.toContain(" [&_[data-matrx-table-toolbar-tabs]]:max-w-[14rem]");
  });
});
