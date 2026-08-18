// features/vision-interview/components/__tests__/ExpertFeedPanel.test.ts
//
// Pins THE DUPLICATE-STREAM RULE (Arman, 2026-08-18) — the one decision the
// right-panel feed makes that a screenshot cannot prove: the role whose tab is
// active in the center panel must NOT stream a second time in the feed, and
// the instant the active tab changes the suppression must follow it.

// The rule under test is a pure function, but its module pulls in the render
// tree (LiveTurnCard → BasicMarkdownContent → react-syntax-highlighter, which
// ships ESM Jest does not transform). Stubbing the one child component keeps
// this a unit test of the decision, not of the markdown pipeline.
jest.mock("../ExpertFeedSection", () => ({ ExpertFeedSection: () => null }));

import { shouldStreamHere } from "../ExpertFeedPanel";
import { ROLE_ORDER, type RoleKey } from "../../types";

describe("shouldStreamHere — the duplicate-stream rule", () => {
  it("suppresses live tokens for the role whose tab is active", () => {
    expect(shouldStreamHere("amplifier", "amplifier")).toBe(false);
  });

  it("streams every other role while one tab is active", () => {
    const active: RoleKey = "amplifier";
    for (const role of ROLE_ORDER) {
      expect(shouldStreamHere(role, active)).toBe(role !== active);
    }
  });

  it("suppresses exactly one role at a time — never two, never none", () => {
    for (const active of ROLE_ORDER) {
      const suppressed = ROLE_ORDER.filter(
        (role) => !shouldStreamHere(role, active),
      );
      expect(suppressed).toEqual([active]);
    }
  });

  it("swaps the moment the user switches tabs", () => {
    const left: RoleKey = "archaeologist";
    const entered: RoleKey = "cartographer";
    // Before the switch: the entered role streams here, the left one does not.
    expect(shouldStreamHere(left, left)).toBe(false);
    expect(shouldStreamHere(entered, left)).toBe(true);
    // After the switch: exactly reversed, with no other state involved.
    expect(shouldStreamHere(left, entered)).toBe(true);
    expect(shouldStreamHere(entered, entered)).toBe(false);
  });

  it("streams everyone when no tab is active", () => {
    for (const role of ROLE_ORDER) {
      expect(shouldStreamHere(role, null)).toBe(true);
    }
  });
});
