import { SurfaceWriteRefusalError } from "@/features/surfaces/runtime/surface-writeback";
import { createAgentRunVariableValuesHandler } from "./agent-run-variable-write";

describe("createAgentRunVariableValuesHandler", () => {
  it("stays registered while definitions temporarily disappear", () => {
    let definitions = [{ name: "topic", defaultValue: null }];
    const applyValues = jest.fn();
    const handler = createAgentRunVariableValuesHandler({
      readDefinitions: () => definitions,
      applyValues,
    });

    definitions = [];

    expect(() => handler({ topic: "billing" })).toThrow(
      SurfaceWriteRefusalError,
    );
    expect(applyValues).not.toHaveBeenCalled();
  });

  it("reads the live definition snapshot when applying", () => {
    let definitions = [{ name: "topic", defaultValue: null }];
    const applyValues = jest.fn();
    const handler = createAgentRunVariableValuesHandler({
      readDefinitions: () => definitions,
      applyValues,
    });

    definitions = [{ name: "audience", defaultValue: null }];
    handler({ audience: "operators" });

    expect(applyValues).toHaveBeenCalledWith({ audience: "operators" });
  });

  it("refuses an unknown key atomically", () => {
    const applyValues = jest.fn();
    const handler = createAgentRunVariableValuesHandler({
      readDefinitions: () => [{ name: "topic", defaultValue: null }],
      applyValues,
    });

    expect(() => handler({ topic: "billing", audience: "operators" })).toThrow(
      '"audience" is not a variable',
    );
    expect(applyValues).not.toHaveBeenCalled();
  });
});
