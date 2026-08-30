import { suppressErrorInspectorBadge } from "../error-inspector-badge-state";

describe("suppressErrorInspectorBadge", () => {
  it.each([
    "/tools/product-capture",
    "/tools/product-capture/instant",
  ])("keeps the global badge out of immersive capture route %s", (pathname) => {
    expect(suppressErrorInspectorBadge(pathname)).toBe(true);
  });

  it.each([
    "/tools/product-capture/all",
    "/tools/product-capture/manage",
    "/administration/error-inspector",
    "/chat",
  ])("keeps the badge available on non-capture route %s", (pathname) => {
    expect(suppressErrorInspectorBadge(pathname)).toBe(false);
  });
});
