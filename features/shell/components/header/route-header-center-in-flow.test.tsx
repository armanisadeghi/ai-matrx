/**
 * THE CENTER NEVER SHARES PIXELS WITH THE TITLE (2026-09-27, /agent-apps/<id>
 * at 768px): RouteHeader's center was `absolute left-1/2`, sized by a
 * ResizeObserver measurement. When that measurement was stale — a hidden tab,
 * or the first paint — the "Switch view" trigger was drawn on top of "Fact
 * Checker Published" (elementFromPoint on the trigger returned the title).
 * Once the measurement caught up, the centered slot was 0px wide and the whole
 * mode nav vanished: at 768px the page had no way to switch modes at all.
 *
 * PINS:
 *   1. The center is an IN-FLOW cell between the left and right regions, so no
 *      measurement — stale or missing — can put it on top of either.
 *   2. With the header's 768px geometry (title 221px, actions 88px, row 390px),
 *      the nav leaves the empty centered slot and draws its icon trigger in the
 *      cell beside the title (`data-route-nav-inflow`), instead of nothing.
 *   3. When not even the icon trigger fits, nothing is drawn — the title wins.
 *   4. The nav's measurers are exempt from the global `* { max-width: 100% }`,
 *      which capped them at the nav's own box (a 408px pill measured 143px).
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix RouteHeader/RouteModeNav,
 * 1 finds no `[data-route-header-center]`, 2 finds no trigger, 4 finds no
 * `max-w-none`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppWindow, Code, History, Play, Settings } from "lucide-react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("./PageHeader", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-test-page-header>{children}</div>,
}));
jest.mock("next/navigation", () => ({
  usePathname: () => "/agent-apps/app-1",
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: () => null,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@ai-matrx/design-system", () => ({
  BottomSheet: () => null,
  BottomSheetBody: () => null,
  BottomSheetHeader: () => null,
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: () => null,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/utils/navigation/should-open-in-new-tab", () => ({ allowNativeNewTab: () => false }));
jest.mock("@/features/shell/components/header/NavItemTooltip", () => ({
  NavItemTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  NavTooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const RouteHeader = (require("./RouteHeader") as typeof import("./RouteHeader")).default;
const { RouteModeNav } = require("./RouteModeNav") as typeof import("./RouteModeNav");

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;

// The live 768px geometry of /agent-apps/<id>, measured in Chromium.
const GEOMETRY = {
  root: 390,
  left: 221,
  right: 88,
  center: 81,
  full: 405,
  icons: 235,
  menu: 121,
  iconTrigger: 60,
};
let geometry = { ...GEOMETRY };

function widthOf(el: HTMLElement): number {
  if (el.hasAttribute("data-route-header-root")) return geometry.root;
  if (el.hasAttribute("data-route-header-left")) return geometry.left;
  if (el.hasAttribute("data-route-header-right")) return geometry.right;
  if (el.hasAttribute("data-route-header-center")) return geometry.center;
  if (el.hasAttribute("data-route-nav-min")) return geometry.iconTrigger;
  const parent = el.parentElement;
  if (parent?.getAttribute("aria-hidden") === "true" && parent.classList.contains("invisible")) {
    const index = [...parent.children].indexOf(el);
    return [geometry.full, geometry.icons, geometry.menu][index] ?? 0;
  }
  return 0;
}

const saved = (["clientWidth", "offsetWidth", "scrollWidth"] as const).map(
  (key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const,
);
beforeAll(() => {
  for (const [key] of saved) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        return widthOf(this);
      },
    });
  }
});
afterAll(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
  }
});

const MODES = [
  { name: "Overview", href: "/agent-apps/app-1", icon: AppWindow },
  { name: "Run", href: "/agent-apps/app-1/run", icon: Play },
  { name: "Code", href: "/agent-apps/app-1/code", icon: Code },
  { name: "Versions", href: "/agent-apps/app-1/versions", icon: History },
  { name: "Settings", href: "/agent-apps/app-1/settings", icon: Settings },
];

let root: Root;
let container: HTMLElement;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <RouteHeader
        left={
          <>
            <button type="button" aria-label="Back" />
            <span>Fact Checker Published</span>
          </>
        }
        center={<RouteModeNav items={MODES} />}
        right={
          <>
            <button type="button" aria-label="Copy reference" />
            <button type="button" aria-label="Unpublish" />
          </>
        }
      />,
    );
  });
}

beforeEach(() => {
  geometry = { ...GEOMETRY };
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("RouteHeader center", () => {
  it("is an in-flow cell between the title and the actions, never absolutely placed over them", () => {
    mount();
    const center = container.querySelector<HTMLElement>("[data-route-header-center]");
    const rowRoot = container.querySelector<HTMLElement>("[data-route-header-root]");
    expect(center?.previousElementSibling?.hasAttribute("data-route-header-left")).toBe(true);
    expect(center?.nextElementSibling?.hasAttribute("data-route-header-right")).toBe(true);
    expect(rowRoot?.className).toContain("grid");
    for (let el: HTMLElement | null = center; el && el !== rowRoot; el = el.parentElement) {
      expect(el.className).not.toMatch(/\babsolute\b/);
    }
  });

  it("keeps the mode switch reachable at 768px: the icon trigger sits in flow beside the title", () => {
    mount();
    const trigger = container.querySelector('button[aria-label="Switch view"]');
    expect(trigger).not.toBeNull();
    expect(container.querySelector("[data-route-nav-inflow]")).not.toBeNull();
    // The current mode is still named for assistive tech.
    expect(trigger?.textContent).toContain("Overview");
  });

  it("draws nothing when not even the icon trigger fits — the title wins", () => {
    geometry.center = 50;
    mount();
    expect(container.querySelector('button[aria-label="Switch view"]')).toBeNull();
    expect(container.querySelector("[data-route-nav-variant]")).toBeNull();
  });

  it("measures the nav at its natural width, past the global max-width: 100%", () => {
    mount();
    const measurers = container.querySelectorAll('.invisible[aria-hidden="true"] > *');
    expect(measurers.length).toBe(4);
    measurers.forEach((m) => expect(m.className).toContain("max-w-none"));
  });
});
