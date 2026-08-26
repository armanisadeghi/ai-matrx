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
});
