import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (name: string) => readFileSync(join(__dirname, name), "utf8");

describe("association picker mobile presentation contract", () => {
  it("routes picker and attached-list surfaces through one non-modal window shell", () => {
    const picker = source("AssociationPicker.tsx");
    const attached = source("AttachedItemsSheet.tsx");
    const window = source("AssociationWindow.tsx");

    expect(picker).not.toContain("<Drawer");
    expect(attached).not.toContain("<Drawer");
    expect(picker).toContain("<AssociationWindow");
    expect(attached).toContain("<AssociationWindow");
    expect(window).toContain('mobilePresentationOverride="card"');
  });

  it("keeps the picker controls touch-safe on phones", () => {
    const picker = source("AssociationPicker.tsx");

    expect(picker).toContain("h-11 pl-8 text-base md:h-9");
    expect(picker).toContain("min-h-11 w-full");
    expect(picker).toContain("h-11 flex-1 text-base md:h-8");
    expect(picker).toContain("h-11 w-11");
  });
});
