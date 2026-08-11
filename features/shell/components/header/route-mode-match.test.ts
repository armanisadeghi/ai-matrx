import {
  resolveActiveRouteMode,
  routeModeItemMatches,
} from "./route-mode-match";

const items = [
  { name: "Overview", href: "/records/one", exact: true },
  { name: "Pages", href: "/records/one/pages" },
  { name: "Settings", href: "/records/one/settings" },
];

describe("route mode matching", () => {
  it("does not let an exact overview mode swallow an unregistered child", () => {
    expect(
      resolveActiveRouteMode(items, "/records/one/capabilities"),
    ).toBeUndefined();
  });

  it("keeps a registered parent active on its nested detail routes", () => {
    expect(
      resolveActiveRouteMode(items, "/records/one/pages/page-1")?.name,
    ).toBe("Pages");
  });

  it("matches on path-segment boundaries", () => {
    expect(
      routeModeItemMatches(items[2], "/records/one/settings-experimental"),
    ).toBe(false);
  });

  it("normalizes query strings and trailing slashes", () => {
    expect(
      resolveActiveRouteMode(items, "/records/one/pages/?view=grid")?.name,
    ).toBe("Pages");
  });
});
