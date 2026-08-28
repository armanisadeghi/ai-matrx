import { readFileSync } from "node:fs";
import { join } from "node:path";

const menuContent = readFileSync(join(__dirname, "MenuContent.tsx"), "utf8");

describe("Context Menu v3 responsive density contract", () => {
  it("keeps every desktop-renderer row at the 44px floor below lg", () => {
    expect(menuContent).toContain('row: "max-lg:min-h-11",');
    expect(menuContent).toContain(
      'row: "max-lg:min-h-11 py-1 text-[13px] leading-5",',
    );
    expect(menuContent).toContain("className={d.row}");
    expect(menuContent).toMatch(/className=\{cn\(\s*d\.row,/);
  });
});
