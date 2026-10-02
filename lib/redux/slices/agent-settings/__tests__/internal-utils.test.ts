import {
  buildApiPayload,
  detectConflicts,
  parseModelControls,
} from "../internal-utils";

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

describe("buildApiPayload", () => {
  it("preserves provider-native internal search and URL context parameters", () => {
    expect(
      buildApiPayload(
        { internal_web_search: true, internal_url_context: false },
        {},
        "builder",
      ),
    ).toEqual({
      internal_web_search: true,
      internal_url_context: false,
    });
  });

  it("preserves the generated output_format parameter", () => {
    expect(
      buildApiPayload({ output_format: "png" }, {}, "builder"),
    ).toEqual({ output_format: "png" });
  });
});

describe("detectConflicts", () => {
  it("never flags the class pin (offering_id) as an unsupported control", () => {
    const controls = parseModelControls({ temperature: { type: "number" } });
    const { conflicts } = detectConflicts(
      { temperature: 0.5, offering_id: "29874e67-5683-40c2-9adb-fb797ea9a176" },
      controls,
      {},
    );
    expect(conflicts.map((c) => c.key)).not.toContain("offering_id");
  });
});
