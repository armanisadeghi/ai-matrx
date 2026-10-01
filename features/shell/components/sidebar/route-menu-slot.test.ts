import { routeMenuDefaultView, routeMenuRegistry } from "@/features/shell/constants/route-menu-registry";
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
    expect(match("/user-settings")).toBe("Settings");
    expect(match("/user-settings/appearance")).toBe("Settings");
    // The retired /settings/* pages had an "Account" menu (deleted 2026-10-01):
    // their addresses redirect to /user-settings, and Vault and Agent
    // shortcuts are ordinary pages on the main nav.
    expect(match("/settings/integrations")).toBeNull();
    expect(match("/vault")).toBeNull();
    expect(match("/agents/shortcuts")).toBeNull();
    const topic = "/research/topics/0b6f2c1e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
    expect(match(topic)).toBe("Research Topic");
    expect(match(`${topic}/intelligence`)).toBe("Research Topic");
    // The topic list, the new-topic wizard, and research tags keep the main nav.
    expect(match("/research")).toBeNull();
    expect(match("/research/topics")).toBeNull();
    expect(match("/research/topics/new")).toBeNull();

    // A prefix that merely starts with the word must not claim the menu.
    expect(match("/marketingxyz")).toBeNull();
    expect(match("/user-settingsxyz")).toBeNull();
    expect(match("/seo/metadata")).toBeNull();
    expect(match("/dashboard")).toBeNull();
  });

  it("gives every entry a distinct pattern and every Large Route a distinct label", () => {
    const patterns = routeMenuRegistry.map((e) => e.pathPattern.source);
    expect(new Set(patterns).size).toBe(patterns.length);
    // A main-first family (the canvas workspace) offers ANOTHER family's menu
    // behind the switch — the same "Chats" — so only route-first labels must differ.
    const labels = routeMenuRegistry.filter((e) => e.defaultView !== "main").map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("puts the Chats menu behind the switch on canvas-workspace pages, main menu in front", () => {
    const entry = (pathname: string) =>
      routeMenuRegistry.find((e) => e.pathPattern.test(pathname)) ?? null;
    for (const pathname of ["/board", "/board/b1", "/education", "/education/progress"]) {
      expect(entry(pathname)?.label).toBe("Chats");
      expect(routeMenuDefaultView(entry(pathname))).toBe("main");
    }
    // The boards LIST is an ordinary page.
    expect(entry("/board/all")).toBeNull();
    // /chat keeps opening on its own menu.
    expect(routeMenuDefaultView(entry("/chat/abc"))).toBe("route");
  });
});

describe("resolveSidebarView", () => {
  it("a main-first family keeps the main menu until the person switches", () => {
    const BOARD = "board";
    expect(resolveSidebarView(null, BOARD, true, "main")).toBe("main");
    expect(resolveSidebarView({ key: BOARD, view: "route" }, BOARD, true, "main")).toBe("route");
  });

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

/**
 * A LARGE ROUTE'S SIDEBAR IS RESOLVED ON THE SERVER (page-pass shared defects,
 * 2026-09-27): /chat/* painted the whole main menu for ~1s and then swapped.
 * PROVEN FAILING BEFORE PASSING: the Sidebar hard-coded `data-sidebar-view="main"`
 * and RouteMenuSlot resolved "main" until the menu chunk loaded.
 */
describe("the first paint of a Large Route is already its route view", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initialSidebarView } = require("./sidebar-initial-view") as typeof import("./sidebar-initial-view");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");

  it("resolves the route view from the request pathname", () => {
    expect(initialSidebarView("/chat/abc")).toBe("route");
    expect(initialSidebarView("/chat")).toBe("route");
    expect(initialSidebarView("/tasks")).toBe("main");
    expect(initialSidebarView("/board")).toBe("main");
  });

  it("the server Sidebar paints it, and the island never resolves 'main' while its menu loads", () => {
    const sidebar = fs.readFileSync(path.join(__dirname, "Sidebar.tsx"), "utf8");
    expect(sidebar).toContain("data-sidebar-view={initialView}");
    expect(sidebar).not.toContain('data-sidebar-view="main"');
    const slot = fs.readFileSync(path.join(__dirname, "RouteMenuSlot.tsx"), "utf8");
    expect(slot).toContain("resolveSidebarView(manual, matchKey, !!match, routeMenuDefaultView(match))");
  });
});
