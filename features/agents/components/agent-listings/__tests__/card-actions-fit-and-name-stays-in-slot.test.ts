/**
 * Agent Factory R60: at ~800px (and in narrow cards beside the chat rail) the card's action
 * bar overflowed and clipped its last icons, and long unbroken names ran under the card icon.
 * Guards: the bar's extras live in the card's ⋯ menu (never a second row), narrow cards
 * show only Run / Edit / ⋯, and the name breaks anywhere inside its slot with the full name
 * on hover.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "..", "AgentCard.tsx"), "utf8");

describe("AgentCard action bar and name", () => {
  it("is a size container so the bar adapts to the card, not the viewport", () => {
    expect(source).toMatch(/"@container flex flex-col/);
  });

  it("moves Duplicate, Edit Details, Create App and Save as Template into the ⋯ menu", () => {
    const menu = source.slice(source.indexOf("<DropdownMenu>"), source.indexOf("</DropdownMenu>"));
    for (const label of ["Duplicate", "Edit Details", "Create App", "Save as Template"]) {
      expect(menu).toContain(label);
    }
    // ...and no longer as always-visible bar icons
    for (const icon of ["icon={FileText}", "icon={AppWindow}", "icon={isConvertingToTemplate ?"]) {
      expect(source).not.toContain(icon);
    }
  });

  it("hides View, Sneak Peek, Share, Orchestra and Delete inline on narrow cards, with menu twins", () => {
    expect(source.match(/hidden @\[340px\]:contents/g)?.length).toBe(3);
    // View, Sneak Peek, Share, Delete + the Add to Orchestra submenu
    expect(source.match(/@\[340px\]:hidden/g)?.length).toBe(5);
  });

  it("keeps Add to Orchestra reachable on narrow cards as a submenu of the ⋯ menu", () => {
    const menu = source.slice(source.indexOf("<DropdownMenu>"), source.indexOf("</DropdownMenu>"));
    expect(menu).toContain("<AddToOrchestraSubmenu");
    // the create dialog is mounted by the card, outside the menu that unmounts on close
    expect(source).toContain("<CreateOrchestraDialog");
    const menuSrc = readFileSync(
      join(__dirname, "..", "..", "..", "orchestras", "components", "AddToOrchestraMenu.tsx"),
      "utf8",
    );
    expect(menuSrc).toContain("DropdownMenuSubTrigger");
    expect(menuSrc).toContain("export function AddToOrchestraSubmenu");
  });

  it("reflows the card grid by a minimum card width instead of shrinking cards", () => {
    const grid = readFileSync(join(__dirname, "..", "AgentsGrid.tsx"), "utf8");
    const cards = grid.slice(grid.indexOf("const renderCards"), grid.indexOf("const renderList"));
    expect(cards).toContain("auto-fill,minmax(");
    expect(cards).not.toMatch(/lg:grid-cols-3|xl:grid-cols-4/);
  });

  it("breaks an unbroken name inside its slot and carries the full name on hover", () => {
    expect(source).toMatch(/<h3\s+title=\{name\}/);
    expect(source).toMatch(/min-w-0 max-w-full/);
    expect(source).toContain("[overflow-wrap:anywhere]");
  });
});
