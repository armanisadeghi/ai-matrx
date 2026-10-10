/**
 * MENU-GAPS: Table ⋯ → Built on it carries Workflows, Automations and the row-change agent, always in
 * the list; Automations opens its panel when offered and says why when it is not.
 */
import { tableMenuExtensions } from "../tableMenuExtensions";

describe("the Built on it entries", () => {
  it("lists Automations beside Workflows in the built-on group and runs the host's opener", () => {
    let opened = 0;
    const entries = tableMenuExtensions({ automations: () => void (opened += 1), workflows: () => {}, rowChangeAgent: () => {} });
    const automations = entries.find((e) => e.id === "automations")!;
    expect(automations.label).toBe("Automations");
    expect(automations.group).toBe("built-on");
    expect(automations.disabledReason).toBeUndefined();
    automations.run();
    expect(opened).toBe(1);
    expect(entries.map((e) => e.id)).toEqual(["workflows", "automations", "row-change-agent"]);
  });

  it("keeps Automations in the list, disabled with a reason, when the page cannot offer it", () => {
    const automations = tableMenuExtensions({}).find((e) => e.id === "automations")!;
    expect(automations.disabledReason).toBeTruthy();
  });
});
