import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import { useModelControls } from "@/features/agents/hooks/useModelControls";

describe("useModelControls", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("treats a selected model missing from a loaded catalog as corrective state", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const models = [
      { id: "available-model", controls: null },
    ] as unknown as AIModelRecord[];

    const result = useModelControls(models, "retired-or-unshared-model");

    expect(result).toEqual({
      normalizedControls: null,
      selectedModel: null,
      error: "Model not found: retired-or-unshared-model",
    });
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Selected model is unavailable in the current catalog",
      {
        selectedModelId: "retired-or-unshared-model",
        availableModelCount: 1,
      },
    );
  });
});
