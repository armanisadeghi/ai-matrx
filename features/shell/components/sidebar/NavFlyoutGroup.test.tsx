/**
 * The desktop flyout, driven as a person drives it.
 *
 * 1. A new-tab row (Launchpad, `openInNewTab`) and a separately hosted app
 *    (`external`) open in a NEW TAB. Launchpad lost that when it moved from
 *    the top level into Workspace › Home: the flyout rendered every child as
 *    an in-app link.
 * 2. ArrowRight on a sub-area row whose submenu hover already opened moves
 *    focus INTO the submenu. Before, the key set a pending-focus flag that
 *    was never consumed (the open submenu did not change), so focus stayed on
 *    the row.
 */
import React, { act, forwardRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ShellNavItem } from "../../constants/nav-data";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ usePathname: () => "/notes" }));
jest.mock("@/features/shell/navigation/useShellNavGates", () => ({
  useShellNavGates: () => ({}),
}));
jest.mock("../../navigation/navActions", () => ({ useNavActions: () => ({}) }));
jest.mock("../../navigation/navPanelActions", () => ({
  useNavPanelActions: () => ({}),
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
    function AppLink(props, ref) {
      return <a ref={ref} {...props} />;
    },
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const NavFlyoutGroup = (require("./NavFlyoutGroup") as typeof import("./NavFlyoutGroup")).default;

const item: ShellNavItem = {
  label: "Workspace",
  href: "/dashboard",
  iconName: "LayoutDashboard",
  section: "primary",
  children: [
    {
      label: "Home",
      href: "/dashboard",
      iconName: "LayoutDashboard",
      children: [
        { label: "Dashboard", href: "/dashboard", iconName: "LayoutDashboard" },
        { label: "Launchpad", href: "/launchpad", iconName: "Rocket", openInNewTab: true },
      ],
    },
    { label: "Notes", href: "/notes", iconName: "NotepadText" },
    { label: "Studio", href: "https://studio.example.com", iconName: "Workflow", external: true },
  ],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<NavFlyoutGroup item={item} candidates={[item]} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  jest.useRealTimers();
});

function openFlyout() {
  const disclosure = host.querySelector<HTMLButtonElement>('button[aria-label="Open Workspace menu"]')!;
  act(() => disclosure.click());
}

function subRow(label: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-sub-key$="::${label}"]`)!;
}

function submenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-nav-submenu]");
}

function hoverOpen(label: string) {
  act(() => {
    subRow(label).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  act(() => {
    jest.advanceTimersByTime(200);
  });
}

function link(label: string): HTMLAnchorElement {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
    (a) => a.textContent?.trim() === label,
  )!;
}

it("opens an external app in a new tab from the flyout", () => {
  openFlyout();
  const studio = link("Studio");
  expect(studio.getAttribute("target")).toBe("_blank");
  expect(studio.getAttribute("rel")).toContain("noopener");
  expect(link("Notes").getAttribute("target")).toBeNull();
});

it("opens Launchpad in a new tab from the Home submenu", () => {
  openFlyout();
  hoverOpen("Home");
  expect(submenu()).not.toBeNull();
  const launchpad = link("Launchpad");
  expect(launchpad.getAttribute("target")).toBe("_blank");
  expect(launchpad.getAttribute("rel")).toContain("noopener");
});

it("moves focus into a submenu hover already opened when ArrowRight is pressed", () => {
  openFlyout();
  hoverOpen("Home");
  const sub = submenu();
  expect(sub).not.toBeNull();
  const rowLink = subRow("Home").querySelector<HTMLElement>('[role="menuitem"]')!;
  act(() => rowLink.focus());
  act(() => {
    rowLink.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  expect(sub!.contains(document.activeElement)).toBe(true);
  expect(document.activeElement?.textContent?.trim()).toBe("Dashboard");
});

// THE SUBMENU STAYS WHILE YOU USE IT (owner, 2026-10-03: "the inner education
// menu closes before you can use it"). Every leaf row scheduled the open
// submenu's close on hover — including the rows INSIDE that submenu, so
// pointing at any of them closed it 320ms later. PROVEN FAILING BEFORE
// PASSING: pass `inSubmenu = false` for submenu rows → this test RED.
it("keeps a submenu open while the pointer moves over its own items", () => {
  openFlyout();
  hoverOpen("Home");
  const sub = submenu();
  expect(sub).not.toBeNull();
  // The pointer crosses from the row into the submenu, then onto an item in it.
  act(() => {
    sub!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  act(() => {
    link("Launchpad").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(submenu()).not.toBeNull();
});

// A tall submenu clamps upward, so the pointer's diagonal path from its row
// crosses open screen. Leaving the row for empty space must not close it before
// the pointer can arrive. PROVEN FAILING BEFORE PASSING: use SUB_CLOSE_DELAY
// (320ms) for the row's leave → this test RED at 500ms.
it("waits for a diagonal path across open screen into the submenu", () => {
  openFlyout();
  hoverOpen("Home");
  expect(submenu()).not.toBeNull();
  act(() => {
    subRow("Home").dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });
  expect(submenu()).not.toBeNull();
  act(() => {
    submenu()!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
  });
  act(() => {
    jest.advanceTimersByTime(1500);
  });
  expect(submenu()).not.toBeNull();
});
