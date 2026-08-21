import { sandboxDisplayName } from "@/lib/sandbox/format";

describe("sandboxDisplayName", () => {
  it("uses the stored name", () => {
    expect(
      sandboxDisplayName({
        name: "  AI Matrx Development  ",
        sandbox_id: "sbx-123",
      }),
    ).toBe("AI Matrx Development");
  });

  it("falls back to the immutable sandbox id", () => {
    expect(
      sandboxDisplayName({ name: null, sandbox_id: "sbx-123" }),
    ).toBe("sbx-123");
  });
});
