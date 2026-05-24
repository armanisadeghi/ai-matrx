"use client";

// RouteMenuSlot — Client island for sidebar view switching (Large Routes).
//
// Renders two things:
//   1. The switch button (in its natural position, before the nav containers)
//   2. The route menu content (portaled into .shell-sidebar-route-nav)
//
// Lifecycle:
//   - Match pathname → dynamic import route menu → auto-switch with animation
//   - No match → render nothing, standard nav stays visible
//   - Switch button toggles between views

import { useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useSidebarExpanded } from "../../hooks/useSidebarExpanded";
import {
  routeMenuRegistry,
  type RouteMenuEntry,
} from "../../constants/route-menu-registry";
import ShellIcon from "../ShellIcon";

type SidebarView = "main" | "route";

function findMatch(pathname: string): RouteMenuEntry | null {
  for (const entry of routeMenuRegistry) {
    if (entry.pathPattern.test(pathname)) return entry;
  }
  return null;
}

function animateSwitch(nav: HTMLElement, to: SidebarView) {
  const mainNav = nav.querySelector<HTMLElement>(".shell-sidebar-main-nav");
  const routeNav = nav.querySelector<HTMLElement>(".shell-sidebar-route-nav");
  if (!mainNav || !routeNav) {
    nav.dataset.sidebarView = to;
    return;
  }

  const outgoing = to === "route" ? mainNav : routeNav;
  const incoming = to === "route" ? routeNav : mainNav;

  outgoing.classList.add("shell-nav-exit");
  outgoing.addEventListener(
    "animationend",
    () => {
      outgoing.classList.remove("shell-nav-exit");
      nav.dataset.sidebarView = to;
      incoming.classList.add("shell-nav-enter");
      incoming.addEventListener(
        "animationend",
        () => incoming.classList.remove("shell-nav-enter"),
        { once: true },
      );
    },
    { once: true },
  );
}

export default function RouteMenuSlot() {
  const pathname = usePathname();
  const expanded = useSidebarExpanded();
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

  // Find the portal target on mount
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".shell-sidebar-route-nav");
    if (el) setRouteNavTarget(el);
  }, []);

  // Handle match changes
  useEffect(() => {
    if (!match) {
      if (matchRef.current) {
        matchRef.current = null;
        setRouteMenu(null);
        setLoading(false);
        hasAutoSwitched.current = false;
        setCurrentView("main");
        const nav = document.querySelector<HTMLElement>(".shell-sidebar-nav");
        if (nav) nav.dataset.sidebarView = "main";
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

  // Auto-switch to route menu once it loads
  useEffect(() => {
    if (!RouteMenu || hasAutoSwitched.current) return;
    hasAutoSwitched.current = true;

    const nav = document.querySelector<HTMLElement>(".shell-sidebar-nav");
    if (nav) {
      requestAnimationFrame(() => {
        animateSwitch(nav, "route");
        setCurrentView("route");
      });
    }
  }, [RouteMenu]);

  const handleSwitch = () => {
    const nav = document.querySelector<HTMLElement>(".shell-sidebar-nav");
    if (!nav) return;
    const next: SidebarView = currentView === "main" ? "route" : "main";
    animateSwitch(nav, next);
    setCurrentView(next);
  };

  if (!match) return null;

  const switchVisible = loading || !!RouteMenu;
  // Constant swap glyph in BOTH views — the control reads identically whether
  // you're in the route menu or the main menu, so it's recognizable as ONE
  // reversible mode-switch (not a nav item). Only the destination label flips.
  const switchIconName = "ArrowLeftRight";
  const switchLabel = currentView === "route" ? "Main Menu" : match.label;

  return (
    <>
      {/* Switch button — in natural DOM position before nav containers */}
      <button
        type="button"
        className="shell-sidebar-switch"
        data-visible={switchVisible ? "true" : undefined}
        onClick={handleSwitch}
        disabled={loading}
        aria-label={`Switch to ${switchLabel}`}
      >
        <span className="shell-nav-icon">
          {loading ? (
            <ShellIcon
              name="Loader2"
              size={14}
              strokeWidth={1.75}
              className="animate-spin"
            />
          ) : (
            <ShellIcon name={switchIconName} size={14} strokeWidth={1.75} />
          )}
        </span>
        <span className="shell-sidebar-switch-label">{switchLabel}</span>
      </button>

      {/* Route menu content — portaled into .shell-sidebar-route-nav */}
      {routeNavTarget &&
        createPortal(
          <>
            {loading && (
              <div className="shell-sidebar-route-loading">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="shell-sidebar-route-loading-item" />
                ))}
              </div>
            )}
            {RouteMenu && <RouteMenu expanded={expanded} />}
          </>,
          routeNavTarget,
        )}
    </>
  );
}
