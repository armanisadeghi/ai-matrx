/**
 * THE GUARD ON A RESTRICTION THAT ACTUALLY RESTRICTS.
 *
 * 🚨 The class defect behind VISION-RECONCILIATION D2. `visibleTabs` used to
 * reach only `AgentListTabs`, which hides tab BUTTONS — it never touched which
 * agents the list was showing. The active tab lives in the consumer's
 * REMEMBERED redux state and `initialTab` is applied once per mount, so a
 * person sitting on "Mine" who then moved a control that narrows the picker got
 * the forbidden catalogue with the tab bar removed: the wrong list, and no
 * control that explained why. Hiding the door is not locking it.
 *
 * `coerceVisibleTab` is that rule alone, and `useAgentListCore` runs it on
 * every change of the tab — not only at mount — so a restriction that arrives
 * late is enforced late.
 */
import { coerceVisibleTab } from "../useAgentListCore";

describe("coerceVisibleTab", () => {
  it("moves a remembered forbidden tab onto the surface's own initial tab", () => {
    expect(coerceVisibleTab("mine", ["system"], "system")).toBe("system");
  });

  it("moves it to the first allowed tab when the initial tab is itself forbidden", () => {
    expect(coerceVisibleTab("mine", ["shared", "system"], "mine")).toBe(
      "shared",
    );
  });

  it("respects the initial tab when it is allowed", () => {
    expect(coerceVisibleTab("mine", ["shared", "system"], "system")).toBe(
      "system",
    );
  });

  it("leaves an already-allowed tab alone — the person's choice within the rules", () => {
    expect(coerceVisibleTab("system", ["shared", "system"], "shared")).toBeNull();
  });

  it("does nothing when the call site declares no restriction", () => {
    expect(coerceVisibleTab("mine", [], "system")).toBeNull();
  });
});
