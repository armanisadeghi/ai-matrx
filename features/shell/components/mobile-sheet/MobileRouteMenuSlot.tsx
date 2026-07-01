"use client";

// MobileRouteMenuSlot — Client island for the mobile side sheet (Large Routes).
// Same lifecycle as RouteMenuSlot: match → import → auto-switch.
// Portals route menu content into .shell-mobile-route-nav.

import { useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  routeMenuRegistry,
  type RouteMenuEntry,
} from "../../constants/route-menu-registry";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import ShellIcon from "../ShellIcon";

type SidebarView = "main" | "route";

function findMatch(pathname: string): RouteMenuEntry | null {
  for (const entry of routeMenuRegistry) {
    if (entry.pathPattern.test(pathname)) return entry;
  }
  return null;
}

export default function MobileRouteMenuSlot() {
  const pathname = usePathname();
  const [RouteMenu, setRouteMenu] = useState<ComponentType<{
    expanded: boolean;
  }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<SidebarView>("main");
  const [routeNavTarget, setRouteNavTarget] = useState<HTMLElement | null>(
    null,
  );
  const matchRef = useRef<RouteMenuEntry | null>(null);
  const hasAutoSwitched = useRef(false);

  const match = findMatch(pathname);
  const matchKey = match?.pathPattern.source ?? null;

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".shell-mobile-route-nav");
    if (el) setRouteNavTarget(el);
  }, []);

  useEffect(() => {
    if (!routeNavTarget) return;

    const handleRouteNavClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest("[data-keep-mobile-menu-open]")) return;
      if (target.closest(".shell-mobile-switch")) return;
      if (
        target.closest(
          "[data-radix-popover-trigger], [data-radix-dropdown-menu-trigger], [data-radix-popover-content], [data-radix-dropdown-menu-content]",
        )
      ) {
        return;
      }

      const link = target.closest("a[href]");
      if (link instanceof HTMLAnchorElement) {
        if (link.target === "_blank") return;
        if (event.metaKey || event.ctrlKey || event.button === 1) return;
        closeShellMobileMenu();
        return;
      }

      const button = target.closest("button");
      if (
        button &&
        button.type === "button" &&
        !button.closest("details > summary")
      ) {
        closeShellMobileMenu();
      }
    };

    routeNavTarget.addEventListener("click", handleRouteNavClick);
    return () =>
      routeNavTarget.removeEventListener("click", handleRouteNavClick);
  }, [routeNavTarget]);

  useEffect(() => {
    if (!match) {
      if (matchRef.current) {
        matchRef.current = null;
        setRouteMenu(null);
        setLoading(false);
        hasAutoSwitched.current = false;
        setCurrentView("main");
        const sheet = document.querySelector<HTMLElement>(
          ".shell-mobile-sheet",
        );
        if (sheet) sheet.dataset.sidebarView = "main";
      }
      return;
    }

    if (matchRef.current?.pathPattern.source === match.pathPattern.source)
      return;
    matchRef.current = match;
    hasAutoSwitched.current = false;
    setRouteMenu(null);
    setLoading(true);

    match.importFn().then((mod) => {
      setRouteMenu(() => mod.default);
      setLoading(false);
    });
  }, [matchKey]);

  useEffect(() => {
    if (!RouteMenu || hasAutoSwitched.current) return;
    hasAutoSwitched.current = true;
    const sheet = document.querySelector<HTMLElement>(".shell-mobile-sheet");
    if (sheet) {
      sheet.dataset.sidebarView = "route";
      setCurrentView("route");
    }
  }, [RouteMenu]);

  const handleSwitch = () => {
    const sheet = document.querySelector<HTMLElement>(".shell-mobile-sheet");
    if (!sheet) return;
    const next: SidebarView = currentView === "main" ? "route" : "main";
    sheet.dataset.sidebarView = next;
    setCurrentView(next);
  };

  if (!match) return null;

  const switchVisible = loading || !!RouteMenu;
  // Constant swap glyph in BOTH views — see RouteMenuSlot for rationale. The
  // control reads identically in either menu so it's clearly one reversible
  // switch; only the destination label flips.
  const switchIconName = "ArrowLeftRight";
  const switchLabel = currentView === "route" ? "Main Menu" : match.label;

  return (
    <>
      {/* Switch button */}
      <button
        type="button"
        className="shell-mobile-switch"
        data-visible={switchVisible ? "true" : undefined}
        onClick={handleSwitch}
        disabled={loading}
        aria-label={`Switch to ${switchLabel}`}
      >
        <span className="shell-nav-icon">
          {loading ? (
            <ShellIcon
              name="Loader2"
              size={18}
              strokeWidth={1.75}
              className="animate-spin"
            />
          ) : (
            <ShellIcon name={switchIconName} size={18} strokeWidth={1.75} />
          )}
        </span>
        <span>{switchLabel}</span>
      </button>

      {/* Route menu content — portaled into .shell-mobile-route-nav */}
      {routeNavTarget &&
        createPortal(
          <>
            {loading && (
              <div className="px-3 py-4 space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-10 rounded-lg bg-[var(--matrx-glass-bg)] animate-pulse"
                  />
                ))}
              </div>
            )}
            {RouteMenu && <RouteMenu expanded={true} />}
          </>,
          routeNavTarget,
        )}
    </>
  );
}
