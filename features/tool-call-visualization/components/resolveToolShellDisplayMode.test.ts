import { resolveToolShellDisplayMode } from "./resolveToolShellDisplayMode";

describe("resolveToolShellDisplayMode", () => {
  it("keeps the generic fallback collapsed until the user opens it", () => {
    expect(resolveToolShellDisplayMode("default", "auto", true)).toBe(
      "never-open",
    );
    expect(resolveToolShellDisplayMode("verbose", "stay-open", true)).toBe(
      "never-open",
    );
  });

  it("preserves existing custom-renderer behavior", () => {
    expect(resolveToolShellDisplayMode("default", "stay-open", false)).toBe(
      "stay-open",
    );
    expect(resolveToolShellDisplayMode("verbose", "auto", false)).toBe(
      "stay-open",
    );
    expect(resolveToolShellDisplayMode("minimal", "stay-open", false)).toBe(
      "never-open",
    );
  });
});
