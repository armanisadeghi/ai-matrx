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

  it("recognizes provider-native aliases the server accepts (gpt-image-2 quality)", () => {
    const models = [
      {
        id: "gpt-image-2",
        controls: {
          aspect_ratio: { type: "enum", enum: ["1:1", "16:9"] },
          quality: { type: "enum", enum: ["auto", "low", "medium", "high"], default: "auto" },
        },
      },
    ] as unknown as AIModelRecord[];

    const { normalizedControls } = useModelControls(models, "gpt-image-2");

    expect(normalizedControls?.quality).toEqual({
      type: "enum",
      enum: ["auto", "low", "medium", "high"],
      default: "auto",
      min: undefined,
      max: undefined,
      required: undefined,
    });
    expect(normalizedControls?.unmappedControls).toEqual({});
  });
});
