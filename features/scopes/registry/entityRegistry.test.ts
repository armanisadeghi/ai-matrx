import { getEntityInfo } from "./entityRegistry";

describe("entityRegistry content-role resolution", () => {
  it("treats a null content_role as an expected unclassified entity", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const info = getEntityInfo("youtube_search");

    expect(info.contentRole).toBe("destination");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("preserves an explicitly classified content role", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const info = getEntityInfo("web_page");

    expect(info.contentRole).toBe("source");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ["web_brand", "/marketing/brands/resource-id"],
    ["web_site", "/marketing/sites/resource-id"],
    ["web_page", "/marketing/pages/resource-id"],
    ["web_property", "/marketing/properties/resource-id"],
    ["web_snapshot", "/marketing/snapshots/resource-id"],
    ["web_screenshot", "/marketing/screenshots/resource-id"],
  ] as const)("gives the %s access-tree node a real ID-only door", (token, href) => {
    expect(getEntityInfo(token).hrefFor?.("resource-id")).toBe(href);
  });

  it("gives research topics a canonical detail door", () => {
    expect(getEntityInfo("research_topic").hrefFor?.("topic-id")).toBe(
      "/research/topics/topic-id",
    );
  });
});
