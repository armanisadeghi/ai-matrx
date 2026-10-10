/**
 * A model change sets the automatic-tools default, and never moves a person's
 * override (auto-tools.thunks.ts decideModelToolDefault). Rules: common-docs
 * systems/agents/agent-tools/TOOL-SOURCES.md rule A.
 */
import { decideModelToolDefault } from "@/features/agents/redux/auto-tools.thunks";

describe("decideModelToolDefault", () => {
  it("turns automatic tools off for a model that cannot use tools", () => {
    expect(
      decideModelToolDefault({ disabled: false, setBy: undefined }, false),
    ).toEqual({ disabled: true, setBy: "model" });
  });

  it("turns them back on when the model had turned them off and the new model can use tools", () => {
    expect(
      decideModelToolDefault({ disabled: true, setBy: "model" }, true),
    ).toEqual({ disabled: false, setBy: undefined });
  });

  it("never turns on a switch the person turned off", () => {
    expect(
      decideModelToolDefault({ disabled: true, setBy: undefined }, true),
    ).toBeNull();
  });

  it("never moves the person's override, either way", () => {
    expect(
      decideModelToolDefault({ disabled: false, setBy: "override" }, false),
    ).toBeNull();
    expect(
      decideModelToolDefault({ disabled: false, setBy: "override" }, true),
    ).toBeNull();
  });

  it("leaves a tool-capable model with the switch on alone", () => {
    expect(
      decideModelToolDefault({ disabled: false, setBy: undefined }, true),
    ).toBeNull();
  });
});
