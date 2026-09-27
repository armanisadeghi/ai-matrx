/**
 * THE PHONE DRAWER OPENS ON A LARGE ROUTE'S OWN MENU (page-pass shared
 * defects, 2026-09-27). On /chat the drawer painted the main menu and swapped
 * to the Chat menu once its chunk loaded. The slot now sets the route view
 * before first paint and shows the skeleton while the menu loads.
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix slot the sheet has no
 * route view at first paint and the switch reads "Chat" (i.e. main view shown).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ usePathname: () => "/chat/abc" }));
jest.mock("@/features/shell/constants/route-menu-registry", () => ({
  routeMenuRegistry: [
    {
      pathPattern: /^\/chat(?:\/|$)/,
      iconName: "MessageSquare",
      label: "Chat",
      importFn: () => new Promise(() => {}),
    },
  ],
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Slot = (require("./MobileRouteMenuSlot") as typeof import("./MobileRouteMenuSlot")).default;

it("sets the route view before the menu chunk arrives", () => {
  const sheet = document.createElement("div");
  sheet.className = "shell-mobile-sheet";
  const nav = document.createElement("div");
  nav.className = "shell-mobile-route-nav";
  sheet.appendChild(nav);
  const host = document.createElement("div");
  sheet.appendChild(host);
  document.body.appendChild(sheet);
  const root = createRoot(host);
  act(() => root.render(<Slot />));
  expect(sheet.dataset.sidebarView).toBe("route");
  expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Switch to Main Menu");
  act(() => root.unmount());
});
