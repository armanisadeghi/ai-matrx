/**
 * The phone's ONLY door to the account menu (Submit Feedback, Preferences,
 * Sign out…) is the account row at the end of the navigation drawer. A
 * 2026-09-20 merge dropped it and the phone had no way in for a week
 * (page-pass 2026-09-27). Mutation: remove `<MobileDrawerUserRow />` from the
 * drawer — this goes RED.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

describe("mobile navigation drawer", () => {
  it("renders the account row", () => {
    const text = readFileSync(
      path.join(process.cwd(), "features/shell/components/mobile-sheet/MobileNavigationDrawer.tsx"),
      "utf8",
    );
    expect(text).toMatch(/import MobileDrawerUserRow from "\.\.\/user-block\/MobileDrawerUserRow"/);
    expect(text).toMatch(/<MobileDrawerUserRow\s*\/>/);
  });
});

describe("mobile navigation drawer — account rail placement", () => {
  // Phone run PB-08 #2 (2026-10-01): the organization picker was the last row
  // of a very long menu. Mutation: move renderAccountRail() below
  // <MobileRouteMenuSlot /> or back into renderRoot — this goes RED.
  it("puts the person, organization and Settings rows above the route menu", () => {
    const text = readFileSync(
      path.join(process.cwd(), "features/shell/components/mobile-sheet/MobileNavigationDrawer.tsx"),
      "utf8",
    );
    const nav = text.indexOf('<nav aria-label="Mobile navigation">');
    const rail = text.indexOf("renderAccountRail()", nav);
    const routeMenu = text.indexOf("<MobileRouteMenuSlot />", nav);
    expect(nav).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(nav);
    expect(rail).toBeLessThan(routeMenu);
    const railBody = text.slice(text.indexOf("const renderAccountRail"), text.indexOf("const renderGroup"));
    expect(railBody).toMatch(/<ShellOrgSwitcher variant="drawer" \/>/);
    expect(railBody).toMatch(/<ShellSettingsMenu variant="drawer" \/>/);
  });
});
