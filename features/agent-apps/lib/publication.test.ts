import { agentAppPublicationPatch } from "./publication";

describe("agentAppPublicationPatch", () => {
  it("publishes status, visibility, and timestamp as one transition", () => {
    expect(agentAppPublicationPatch(true, "2026-08-15T00:00:00.000Z")).toEqual({
      status: "published",
      visibility: "public",
      published_at: "2026-08-15T00:00:00.000Z",
    });
  });

  it("unpublishes to the owning organization and clears the timestamp", () => {
    expect(agentAppPublicationPatch(false)).toEqual({
      status: "draft",
      visibility: "internal",
      published_at: null,
    });
  });
});
