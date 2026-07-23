import { sanitizeAgentToolIds } from "../sanitize-tool-ids";

describe("sanitizeAgentToolIds", () => {
  const validId = "3f2ecde9-8da7-4c23-9d3f-4c6e60b3e9f1";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("preserves well-formed unique UUIDs", () => {
    expect(sanitizeAgentToolIds([validId], "test")).toEqual([validId]);
  });

  it("removes malformed and duplicate ids before PostgREST can cast them", () => {
    const report = jest.spyOn(console, "error").mockImplementation(() => undefined);

    expect(
      sanitizeAgentToolIds(
        ["not-a-uuid", validId, validId.toUpperCase()],
        "test",
      ),
    ).toEqual([validId]);
    expect(report).toHaveBeenCalledWith(
      "[agent-tool-sanitizer] Removed malformed or duplicate tool ids",
      expect.objectContaining({
        context: "test",
        rejectedToolIds: ["not-a-uuid", validId.toUpperCase()],
      }),
    );
  });

  it("treats absent tool lists as an empty assignment", () => {
    expect(sanitizeAgentToolIds(undefined, "test")).toEqual([]);
    expect(sanitizeAgentToolIds(null, "test")).toEqual([]);
  });
});
