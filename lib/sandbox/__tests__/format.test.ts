import {
  sandboxDisplayName,
  formatSandboxTimestamp,
} from "@/lib/sandbox/format";

describe("sandbox timestamps", () => {
  // Live fleet contains expires_at='infinity', a valid PostgreSQL timestamp.
  it("renders unlimited expiry without JavaScript Invalid Date", () => {
    expect(formatSandboxTimestamp("infinity")).toBe("No expiry");
  });
  it("distinguishes missing and malformed timestamps", () => {
    expect(formatSandboxTimestamp(null)).toBe("—");
    expect(formatSandboxTimestamp("invalid")).toBe("Invalid timestamp");
  });
});

describe("sandboxDisplayName", () => {
  it("uses the stored name", () => {
    expect(
      sandboxDisplayName({
        name: "  AI Matrx Development  ",
        sandbox_id: "sbx-123",
      }),
    ).toBe("AI Matrx Development");
  });

  it("makes unnamed sandboxes distinguishable", () => {
    expect(
      sandboxDisplayName({ name: null, sandbox_id: "sbx-123456789abc" }),
    ).toBe("Unnamed · 789abc");
  });
});
