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
