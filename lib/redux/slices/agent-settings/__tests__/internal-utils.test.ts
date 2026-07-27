import { parseModelControls } from "../internal-utils";

describe("parseModelControls", () => {
  it("preserves an explicit integer control when no default is declared", () => {
    const controls = parseModelControls({
      max_output_tokens: {
        type: "integer",
        min: 1,
        max: 128_000,
      },
    });

    expect(controls.max_output_tokens).toEqual({
      type: "integer",
      min: 1,
      max: 128_000,
      default: undefined,
      required: undefined,
    });
  });

  it("still infers legacy untyped numeric controls", () => {
    const controls = parseModelControls({
      top_k: { min: 1, max: 10, default: 5 },
      temperature: { min: 0, max: 1, default: 0.5 },
    });

    expect(controls.top_k?.type).toBe("integer");
    expect(controls.temperature?.type).toBe("number");
  });
});
