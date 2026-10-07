import { appletPublicationPatch } from "./publication";

describe("appletPublicationPatch", () => {
  it("publishes status, the web switch, and timestamp as one transition", () => {
    expect(
      appletPublicationPatch(true, "2026-08-15T00:00:00.000Z", "user-1"),
    ).toEqual({
      status: "published",
      published_to_web: true,
      published_to_web_at: "2026-08-15T00:00:00.000Z",
      published_to_web_by: "user-1",
      published_at: "2026-08-15T00:00:00.000Z",
    });
  });

  it("stops publishing to the web and clears the timestamp", () => {
    const patch = appletPublicationPatch(false);
    expect(patch).toMatchObject({
      status: "draft",
      published_to_web: false,
      published_to_web_by: null,
      published_at: null,
    });
    expect(typeof patch.published_to_web_at).toBe("string");
  });
});
