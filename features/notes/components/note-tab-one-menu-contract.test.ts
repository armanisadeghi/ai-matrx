import fs from "node:fs";
import path from "node:path";

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, rel), "utf8");

/**
 * ONE MENU PER TAB. The note tab's "…" button must open the same universal
 * v3 menu that right-click opens (via `openContextMenuForElement`) — never a
 * second bespoke dropdown. A second dropdown holding only the "Tab" items hid
 * every content action (Copy as / Export → Print / Convert …) from the one
 * control a person actually clicks; Arman could not find Print in Notes
 * (2026-09-21).
 */
describe("Note tab: one menu, opened by right-click and by the … button", () => {
  const tab = read("NoteTabItem.tsx");

  it("routes the … button through the canonical v3 opener", () => {
    expect(tab).toContain("openContextMenuForElement(tabRef.current)");
    expect(tab).toContain('aria-haspopup="menu"');
    expect(tab).toContain("<NonEditableContextMenu");
  });

  it("carries no second dropdown menu", () => {
    expect(tab).not.toContain("DropdownMenuTrigger");
    expect(tab).not.toContain("DropdownMenuContent");
  });

  it("keeps the Tab section operationally complete", () => {
    for (const id of [
      "save",
      "copy-reference",
      "duplicate",
      "move-to-folder",
      "about",
      "knowledge",
      "export-markdown",
      "close-tab",
      "close-others",
      "close-all",
      "delete",
    ]) {
      expect(tab).toContain(`id: "${id}"`);
    }
  });
});

describe("MatrxSplit preview actions are visible without hovering", () => {
  it("defaults actionsBehavior to always", () => {
    const split = read("../../../components/matrx/MatrxSplit.tsx");
    expect(split).toContain('actionsBehavior={actionsBehavior ?? "always"}');
    expect(split).not.toContain('actionsBehavior ?? "hover-only"');
  });
});
