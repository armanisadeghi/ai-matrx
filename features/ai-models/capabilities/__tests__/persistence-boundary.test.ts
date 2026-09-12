import { requireCanonicalCapabilities } from "../parse";

describe("model capability persistence boundary", () => {
  it.each([
    "structured_outputs",
    "code_interpreter",
    "reasoning",
    "batch",
    "pdf_input",
  ])("rejects the provider alias %s", (alias) => {
    expect(() =>
      requireCanonicalCapabilities({
        input: ["text"],
        output: ["text"],
        features: [alias],
        interaction: "turn",
      }),
    ).toThrow("unknown capability value");
  });

  it("rejects unknown canonical keys rather than returning raw JSON", () => {
    expect(() =>
      requireCanonicalCapabilities({
        input: ["text"],
        output: ["text"],
        features: [],
        interaction: "turn",
        provider_capabilities: { structured_outputs: true },
      }),
    ).toThrow("unknown canonical capability key");
  });

  it("preserves the canonical additions", () => {
    expect(
      requireCanonicalCapabilities({
        input: ["text", "image"],
        output: ["text", "image"],
        features: ["inpainting", "context_management"],
        interaction: "turn",
      }),
    ).toEqual({
      input: ["text", "image"],
      output: ["text", "image"],
      features: ["inpainting", "context_management"],
      interaction: "turn",
      multilingual: false,
    });
  });
});
