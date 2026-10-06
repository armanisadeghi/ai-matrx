import { describe, expect, it } from "vitest";

import { normalizePreviewUrl } from "./useLinkPreview";

describe("normalizePreviewUrl", () => {
  it("adds https and rejects non-http", () => {
    expect(normalizePreviewUrl("example.com/a")).toBe("https://example.com/a");
    expect(normalizePreviewUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePreviewUrl("  ")).toBeNull();
    expect(normalizePreviewUrl(null)).toBeNull();
  });
});
