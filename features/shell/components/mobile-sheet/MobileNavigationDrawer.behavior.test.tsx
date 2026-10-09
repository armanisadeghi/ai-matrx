/**
 * The phone drawer, driven as a person drives it.
 *
 * 1. SEARCH INSIDE AN AREA. On a Large Route the drawer opens on the area's
 *    own menu (the route view), which hides the full menu — and the search
 *    results render in the full menu. Typing showed nothing at all. Typing now
 *    takes the drawer to the full menu, where the results are.
 * 2. NEW-TAB ROWS. A child with `openInNewTab` (Launchpad) opens in a new tab
 *    from the drawer too.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ShellNavItem } from "../../constants/nav-data";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ usePathname: () => "/chat/abc" }));
jest.mock("@/features/shell/navigation/navActions", () => ({ useNavActions: () => ({}) }));
jest.mock("@/features/shell/navigation/navPanelActions", () => ({
  useNavPanelActions: () => ({}),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => true }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectIsAuthenticated: () => true }));
jest.mock("../account-rail/ShellSettingsMenu", () => ({ ShellSettingsMenu: () => null }));
jest.mock("../account-rail/ShellOrgSwitcher", () => ({ ShellOrgSwitcher: () => null }));
jest.mock("../user-block/MobileDrawerUserRow", () => ({ __esModule: true, default: () => null }));
jest.mock("../sidebar/admin-menu/AdminMobileMenuItem", () => ({ __esModule: true, default: () => null }));
jest.mock("@ai-matrx/design-system/tap-target/buttons", () => ({ XTapButton: () => null }));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
jest.mock("@ai-matrx/design-system", () => ({
  BottomSheet: ({
    open,
    contentClassName,
    children,
  }: {
    open: boolean;
    contentClassName?: string;
    children: React.ReactNode;
  }) => (open ? <div className={contentClassName}>{children}</div> : null),
  BottomSheetBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("@/features/shell/constants/route-menu-registry", () => ({
  routeMenuDefaultView: (entry: { defaultView?: string } | null) =>
    entry ? (entry.defaultView ?? "route") : "main",
  routeMenuRegistry: [
    {
      pathPattern: /^\/chat(?:\/|$)/,
      iconName: "MessageSquare",
      label: "Chat",
      importFn: () =>
        Promise.resolve({ default: () => <div data-testid="chat-route-menu">Chat menu</div> }),
    },
  ],
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Drawer = (require("./MobileNavigationDrawer") as typeof import("./MobileNavigationDrawer")).default;

const items: ShellNavItem[] = [
  {
    label: "Workspace",
    href: "/dashboard",
    iconName: "LayoutDashboard",
    section: "primary",
    children: [
      { label: "Notes", href: "/notes", iconName: "NotepadText" },
      { label: "Launchpad", href: "/launchpad", iconName: "Rocket", openInNewTab: true },
    ],
  },
];
const settingsItem: ShellNavItem = {
  label: "Settings",
  href: "/user-settings",
  iconName: "Settings",
  section: "primary",
};

let host: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  const control = document.createElement("input");
  control.type = "checkbox";
  control.id = "shell-mobile-menu";
  control.checked = true;
  document.body.appendChild(control);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Drawer items={items} settingsItem={settingsItem} />));
  // The drawer mounts on the next animation frame, then the route menu loads.
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
  await flush();
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

function sheet(): HTMLElement {
  return document.querySelector<HTMLElement>(".shell-mobile-sheet")!;
}

function type(text: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="search"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("opens on the area's own menu", () => {
  expect(sheet().dataset.sidebarView).toBe("route");
  expect(document.querySelector('[data-testid="chat-route-menu"]')).not.toBeNull();
});

it("shows search results: typing takes the drawer to the full menu", () => {
  expect(sheet().dataset.sidebarView).toBe("route");
  type("notes");
  // The results live in the full menu, which the route view hides.
  expect(sheet().dataset.sidebarView).toBe("main");
  const results = Array.from(document.querySelectorAll("a")).map((a) => a.textContent);
  expect(results.some((text) => text?.includes("Notes"))).toBe(true);
  const switchButton = document.querySelector<HTMLButtonElement>(".shell-mobile-switch")!;
  expect(switchButton.getAttribute("aria-label")).toBe("Open the Chat menu");
});

it("opens a new-tab row in a new tab", () => {
  act(() => {
    document.querySelector<HTMLButtonElement>(".shell-mobile-switch")!.click();
  });
  const open = document.querySelector<HTMLButtonElement>('button[aria-label="Open Workspace menu"]')!;
  act(() => open.click());
  const launchpad = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find((a) =>
    a.textContent?.includes("Launchpad"),
  )!;
  expect(launchpad.getAttribute("target")).toBe("_blank");
  expect(launchpad.getAttribute("rel")).toContain("noopener");
});
