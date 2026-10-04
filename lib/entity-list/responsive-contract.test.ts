import { readFileSync } from "node:fs";
import { join } from "node:path";

const componentSource = (name: string) =>
  readFileSync(join(__dirname, "components", name), "utf8");

describe("Entity List responsive contract", () => {
  // THE TAP MODEL (owner, /board/all on an iPad, 2026-10-02: "giant buttons"):
  // every header control is 28px at every width; touch gets an invisible 44px
  // ring from `.matrx-tap-ring` instead of a 44px layout. A control that grows
  // again (`h-11`, `h-12`, `lg:h-9`, `min-w-11`) fails here.
  it("keeps every header control at the one 28px height on every screen", () => {
    for (const name of [
      "EntityScopeTabs.tsx",
      "EntityOrgFilter.tsx",
      "EntityColumnPicker.tsx",
      "EntityListToolbar.tsx",
    ]) {
      const source = componentSource(name);
      expect({ name, grows: source.match(/\b(?:h-1[0-2]|min-h-1[01]|min-w-11|lg:h-9)\b/g) }).toEqual({
        name,
        grows: null,
      });
    }
    // The filter trigger (its popover content keeps the touch floor).
    expect(componentSource("EntityFilterPanel.tsx")).toContain(
      '"relative inline-flex h-7 items-center',
    );
    // The control row and the toolbar opt into the ring and out of the growth floor.
    expect(componentSource("EntityListPage.tsx")).toContain('"matrx-tap-ring flex min-w-0 items-center');
    expect(componentSource("EntityListToolbar.tsx")).toContain('className="matrx-tap-ring flex min-w-0 flex-wrap');
    const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
    expect(css).toContain(":not(.matrx-tap-ring *):not(thead *) {\n      min-height: 2.75rem;");
    expect(css).toMatch(/:is\(\.matrx-tap-ring, \.matrx-touch-targets thead\)[\s\S]*?::before \{/);
    expect(css).toContain(".matrx-tap-ring [data-matrx-button][data-tap-floor]:not([data-touch-exempt])");
  });

  // list-shell fix D (2026-09-28): at 375px the saved-view strip was squeezed
  // to "Defau…" and its "+" ran off-screen. Below sm the table controls take
  // the full row and the strip is not capped at 14rem. (Live proof: page:look
  // phone views of /education/quizzes and /education/flashcards.)
  it("opens the toolbar row with the table's view tabs, far left, without reaching into the table", () => {
    // Owner, /agents/all 2026-10-04: "the view tabs … need to be all the way to the left", and the
    // page may not re-style the canonical table (THE CANONICAL-OVERRIDE LAW).
    const toolbar = componentSource("EntityListToolbar.tsx");
    const desktop = toolbar.slice(toolbar.indexOf('data-entity-list-toolbar=""'));
    expect(desktop.indexOf("data-entity-list-table-tabs")).toBeGreaterThan(-1);
    expect(desktop.indexOf("data-entity-list-table-tabs")).toBeLessThan(desktop.indexOf("{searchBox}"));
    expect(toolbar).not.toMatch(/\[&[_>][^\]]*data-matrx-/);
  });

  it("draws two header rows at every width — the toolbar never joins the lane row", () => {
    const page = componentSource("EntityListPage.tsx");
    expect(page).not.toContain("useHeaderRowFit");
    expect(page).toContain("{phoneWidth ? null : renderToolbar()}");
  });
});
