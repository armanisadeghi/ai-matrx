/**
 * Default chrome port (P22). A bare host has no app shell: no header slots, no
 * phone ⋮ sheet, no navigation drawer, no canvas chrome. So every header piece
 * renders its content IN PLACE (the controls stay reachable where the page put
 * them), the shell-only pieces render nothing, and full-screen layers keep the
 * one Escape rule with the package's own stack. Opening a navigation drawer
 * that does not exist says so once.
 *
 * matrx-frontend overrides every member with its shell (`providers/ChatHostAdapter.tsx`).
 */

import { Fragment, createElement } from "react";
import type {
  ChatChromePort,
  ChatChromeStyles,
  ChatHeaderPortalProps,
  ChatHeaderSlotProps,
  ChatIconButtonProps,
  ChatNavItemTooltipProps,
  ChatPhonePageActions,
  ChatRouteHeaderProps,
} from "../contract";
import { announceOnce } from "../errors";

const NO_PHONE_SHEET: ChatPhonePageActions = Object.freeze({
  host: null,
  count: 0,
});

export const DEFAULT_CHROME_STYLES: ChatChromeStyles = Object.freeze({
  navItemSelected: "bg-accent text-accent-foreground font-semibold",
  navItemUnselected:
    "text-muted-foreground hover:text-foreground hover:bg-accent/50",
  routeMenuNavItem:
    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50",
  routeMenuIconSize: 18,
  routeMenuIconStrokeWidth: 1.75,
});

function HeaderCenter({ desktop, mobile, children }: ChatHeaderPortalProps) {
  return createElement(Fragment, null, children ?? desktop ?? mobile ?? null);
}

function HeaderRight({ children }: { children?: ChatHeaderSlotProps["children"] }) {
  return createElement(Fragment, null, children);
}

function HeaderActionsSlot({ children, className }: ChatHeaderSlotProps) {
  return createElement(
    "div",
    { className: className ?? "flex shrink-0 items-center" },
    children,
  );
}

function RouteHeader({ left, center, right }: ChatRouteHeaderProps) {
  return createElement(
    "div",
    { className: "flex w-full items-center justify-between gap-2" },
    createElement("div", { className: "flex min-w-0 items-center" }, left),
    center,
    createElement("div", { className: "flex shrink-0 items-center" }, right),
  );
}

function Nothing(): null {
  return null;
}

function IconButton({
  icon,
  onClick,
  label,
  asLabel,
  htmlFor,
  className,
  disabled,
}: ChatIconButtonProps) {
  const base = `inline-flex h-11 w-11 items-center justify-center ${className ?? ""}`;
  if (asLabel) {
    return createElement(
      "label",
      { htmlFor, className: base, "aria-label": label },
      icon,
    );
  }
  return createElement(
    "button",
    { type: "button", onClick, className: base, "aria-label": label, disabled },
    icon,
  );
}

function NavTooltipProvider({ children }: { children?: ChatHeaderSlotProps["children"] }) {
  return createElement(Fragment, null, children);
}

function NavItemTooltip({ label, disabled, children }: ChatNavItemTooltipProps) {
  if (disabled) {
    return createElement(Fragment, null, children);
  }
  return createElement("span", { title: label, className: "inline-flex" }, children);
}

/** Full-screen layers: one Escape leaves only the top layer (same rule as the app shell). */
const layers: Array<() => void> = [];

function onEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const top = layers[layers.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  top();
}

function pushFullScreenLayer(exit: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (layers.length === 0) window.addEventListener("keydown", onEscape, true);
  layers.push(exit);
  return () => {
    const at = layers.lastIndexOf(exit);
    if (at >= 0) layers.splice(at, 1);
    if (layers.length === 0)
      window.removeEventListener("keydown", onEscape, true);
  };
}

export function createDefaultChrome(): ChatChromePort {
  return {
    HeaderCenter,
    HeaderRight,
    HeaderActionsSlot,
    RouteHeader,
    HeaderControlSet: Nothing,
    CanvasChromeMode: Nothing,
    IconButton,
    NavTooltipProvider,
    NavItemTooltip,
    usePhonePageActions: () => NO_PHONE_SHEET,
    useCanvasFullScreen: () => {},
    openMobileMenu() {
      announceOnce(
        "chrome-no-mobile-menu",
        "This host has no navigation drawer to open. Pass a `chrome` port with openMobileMenu to the chat host.",
      );
    },
    closeMobileMenu() {
      /* nothing is open */
    },
    pushFullScreenLayer,
    styles: DEFAULT_CHROME_STYLES,
  };
}
