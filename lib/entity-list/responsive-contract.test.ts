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
    expect(componentSource("EntityListPage.tsx")).toContain('"matrx-tap-ring flex min-w-0 flex-nowrap items-center');
    expect(componentSource("EntityListToolbar.tsx")).toContain('className="matrx-tap-ring flex min-w-0 flex-nowrap');
    // The tap model's floor and ring rules moved out of app/globals.css into the design system's
    // web-theme.css (tap-target -> design-system, 59a2f9afb84); the app imports both, so the
    // contract reads both. The assertions below are unchanged.
    const css =
      readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8") +
      readFileSync(
        join(__dirname, "..", "..", "node_modules", "@ai-matrx", "design-system", "dist", "web-theme.css"),
        "utf8",
      );
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
    // The phone's compact toolbar is row 2 as well, never inside the lane row.
    const row = page.slice(page.indexOf("data-entity-list-control-row"), page.indexOf("TWO ROWS, ALWAYS"));
    expect(row).not.toContain("renderToolbar(");
  });

  // THE PANE DECIDES, NEVER THE VIEWPORT (owner, /agents/all beside the chat panel 2026-10-04: a
  // 540px list at a 1024px viewport kept every control full-size; the header took four lines).
  // Each row is ONE line (flex-nowrap, above) and folds by the header's container width: no
  // viewport variant may size a control in the two rows. Live proof: `pnpm check:list-header-rows`.
  it("folds the header's controls by the pane's width, never the viewport's", () => {
    const page = componentSource("EntityListPage.tsx");
    expect(page).toMatch(/containerName: `list \$\{CONTROLS_CONTAINER_NAME\}`/);
    const row = page.slice(page.indexOf("data-entity-list-control-row"), page.indexOf("TWO ROWS, ALWAYS"));
    const toolbar = componentSource("EntityListToolbar.tsx");
    const desktop = toolbar.slice(toolbar.indexOf('data-entity-list-toolbar=""'));
    const viewMenu = toolbar.slice(toolbar.indexOf("const viewMenu"), toolbar.indexOf("if (phoneRow)"));
    const VIEWPORT = /(?<![@\w/-])(?:max-)?(?:sm|md|lg|xl|2xl):[\w[]/g;
    for (const [name, source] of [["control row", row], ["toolbar", desktop], ["view menu", viewMenu]] as const) {
      expect({ name, viewport: source.match(VIEWPORT) }).toEqual({ name, viewport: null });
    }
    // The filters and the column picker fold by the list container too.
    for (const name of ["EntityDimensionFilter.tsx", "EntityOrgFilter.tsx"]) {
      expect(componentSource(name)).toContain("@max-3xl/list:sr-only");
    }
    expect(componentSource("EntityFilterPanel.tsx")).toContain('<span className="@max-3xl/list:sr-only">Filters</span>');
  });
});
