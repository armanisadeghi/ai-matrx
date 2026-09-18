import { readFileSync } from "node:fs";

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

  // ─── V-21: the two Google Workspace records the registry was never told about ──
  it.each([
    ["calendar_event", "/detail/calendar_event/record-id"],
    ["google_document", "/detail/google_document/record-id"],
  ] as const)(
    "gives %s the Detail primitive's addressable door (it has no title column, so no peek either)",
    (token, href) => {
      expect(getEntityInfo(token).hrefFor?.("record-id")).toBe(href);
    },
  );

  it("still spells the detail route the way DetailHost spells it", () => {
    // The registry cannot IMPORT `detailPageHref` (DetailHost is a "use client"
    // module with the window-manager graph behind it, and this registry feeds the
    // component-free door resolver). So the two spellings are held together here:
    // move the page presentation's route and this fails instead of every Google
    // record's door quietly 404ing.
    const host = readFileSync(
      "features/window-panels/detail/DetailHost.tsx",
      "utf8",
    );
    expect(host).toContain(
      "`/detail/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.id)}`",
    );
  });
});
