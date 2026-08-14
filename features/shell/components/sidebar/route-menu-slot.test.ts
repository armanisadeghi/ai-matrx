import { routeMenuRegistry } from "@/features/shell/constants/route-menu-registry";
import { resolveSidebarView } from "./RouteMenuSlot";

const MARKETING = "^\\/marketing(?:\\/|$)";
const CHAT = "^\\/chat(?:\\/|$)";

describe("route menu registry", () => {
  it("matches each Large Route and nothing outside it", () => {
    const match = (pathname: string) =>
      routeMenuRegistry.find((entry) => entry.pathPattern.test(pathname))
        ?.label ?? null;

    expect(match("/marketing")).toBe("Marketing");
    expect(match("/marketing/sites")).toBe("Marketing");
    expect(match("/marketing/brands/b1/sites/s1/audit")).toBe("Marketing");
    expect(match("/chat")).toBe("Chats");
    expect(match("/administration/users")).toBe("Administration");

    // A prefix that merely starts with the word must not claim the menu.
    expect(match("/marketingxyz")).toBeNull();
    expect(match("/seo/metadata")).toBeNull();
    expect(match("/dashboard")).toBeNull();
  });

  it("gives every entry a distinct pattern and label", () => {
    const patterns = routeMenuRegistry.map((e) => e.pathPattern.source);
    const labels = routeMenuRegistry.map((e) => e.label);
    expect(new Set(patterns).size).toBe(patterns.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("resolveSidebarView", () => {
  it("shows the route menu once it has loaded", () => {
    expect(resolveSidebarView(null, MARKETING, false)).toBe("main");
    expect(resolveSidebarView(null, MARKETING, true)).toBe("route");
  });

  it("shows the main nav where no Large Route matches", () => {
    expect(resolveSidebarView(null, null, false)).toBe("main");
  });

  it("lets a manual choice beat the loaded route menu", () => {
    expect(
      resolveSidebarView({ key: MARKETING, view: "main" }, MARKETING, true),
    ).toBe("main");
  });

  /**
   * The regression this function exists for. The view used to be one-shot
   * state: choosing "Main Menu" inside marketing was silently undone by the
   * very next navigation, because every load re-ran the auto-switch. Marketing
   * is a place users leave constantly (to a note, an agent, a file), so an
   * un-leavable menu is the difference between immersive and trapped.
   */
  it("keeps a manual choice across navigation inside the same route family", () => {
    const choice = { key: MARKETING, view: "main" as const };
    expect(resolveSidebarView(choice, MARKETING, true)).toBe("main");
  });

  it("drops a manual choice when a different Large Route takes over", () => {
    const choice = { key: MARKETING, view: "main" as const };
    // Walking from marketing into chat must open chat's menu, not inherit a
    // decision made about marketing.
    expect(resolveSidebarView(choice, CHAT, true)).toBe("route");
    // And leaving Large Routes entirely falls back to the global nav.
    expect(resolveSidebarView(choice, null, false)).toBe("main");
  });

  it("lets a user who switched away switch back", () => {
    expect(
      resolveSidebarView({ key: MARKETING, view: "route" }, MARKETING, true),
    ).toBe("route");
  });
});
