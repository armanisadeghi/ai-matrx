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

export type SidebarView = "main" | "route";

/** A manual switch, remembered against the route family it was made in. */
export interface ManualSidebarChoice {
  key: string | null;
  view: SidebarView;
}

/**
 * Which nav the sidebar shows. Pure, so the rule is testable and stated once.
 *
 *   • a loaded route menu shows itself (that IS the Large Route behaviour)
 *   • a manual choice wins over it — and SURVIVES navigation, which it did not
 *     before: the view was one-shot state, so "Main Menu" was silently undone
 *     by the next navigation inside the same route family
 *   • but only within that family, so walking from /chat into /marketing still
 *     opens marketing's menu rather than inheriting a choice made elsewhere
 */
export function resolveSidebarView(
  manual: ManualSidebarChoice | null,
  matchKey: string | null,
  hasRouteMenu: boolean,
): SidebarView {
  if (manual && manual.key === matchKey) return manual.view;
  return hasRouteMenu ? "route" : "main";
}

function findMatch(pathname: string): RouteMenuEntry | null {
  for (const entry of routeMenuRegistry) {
    if (entry.pathPattern.test(pathname)) return entry;
  }
  return null;
}

/**
 * `--shell-duration-normal` (320ms) plus slack. The flip must land even when
 * the animation that normally drives it never runs.
 */
const SWITCH_FALLBACK_MS = 450;

function animateSwitch(nav: HTMLElement, to: SidebarView) {
  const mainNav = nav.querySelector<HTMLElement>(".shell-sidebar-main-nav");
  const routeNav = nav.querySelector<HTMLElement>(".shell-sidebar-route-nav");
  if (!mainNav || !routeNav) {
    nav.dataset.sidebarView = to;
    return;
  }

  const outgoing = to === "route" ? mainNav : routeNav;
  const incoming = to === "route" ? routeNav : mainNav;

  // THE VIEW FLIP MAY NEVER DEPEND ON AN ANIMATION EVENT ALONE. A page that is
  // hidden, backgrounded, or otherwise not animating never fires `animationend`
  // — and because the caller has already marked the auto-switch as done, the
  // sidebar would strand on the wrong menu for the rest of the session with the
  // correct menu rendered and hidden beside it. Observed on a real navigation
  // into a site while the tab was not visible. The animation is decoration; the
  // timer guarantees the outcome.
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    outgoing.classList.remove("shell-nav-exit");
    nav.dataset.sidebarView = to;
    incoming.classList.add("shell-nav-enter");
    const clearEnter = () => incoming.classList.remove("shell-nav-enter");
    incoming.addEventListener("animationend", clearEnter, { once: true });
    window.setTimeout(clearEnter, SWITCH_FALLBACK_MS);
  };

  outgoing.classList.add("shell-nav-exit");
  outgoing.addEventListener("animationend", settle, { once: true });
  window.setTimeout(settle, SWITCH_FALLBACK_MS);
}

export default function RouteMenuSlot() {
  const pathname = usePathname();
  const expanded = useSidebarExpanded();
  const [RouteMenu, setRouteMenu] = useState<ComponentType<{
    expanded: boolean;
  }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeNavTarget, setRouteNavTarget] = useState<HTMLElement | null>(
    null,
  );
  const matchRef = useRef<RouteMenuEntry | null>(null);

  const match = findMatch(pathname);
  const matchKey = match?.pathPattern.source ?? null;

  /**
   * The visible view is DERIVED, not synced. It used to be its own state that
   * an effect wrote after the menu loaded, which meant the flip could be missed
   * entirely (see animateSwitch) and needed a one-shot ref to avoid fighting
   * itself. Now: a loaded route menu shows itself, and a manual choice wins —
   * but only for the route family it was made in, so walking into a different
   * Large Route still opens that route's menu.
   */
  const [manual, setManual] = useState<ManualSidebarChoice | null>(null);
  const currentView = resolveSidebarView(manual, matchKey, !!RouteMenu);

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
      }
      return;
    }

    if (matchRef.current?.pathPattern.source === match.pathPattern.source)
      return;
    matchRef.current = match;
    setRouteMenu(null);
    setLoading(true);

    match.importFn().then((mod) => {
      setRouteMenu(() => mod.default);
      setLoading(false);
    });
  }, [matchKey]);

  // The DOM follows the derived view. Deliberately NOT scheduled inside
  // requestAnimationFrame: rAF does not run in a hidden page, and the switch
  // must land whether or not the page is visible.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".shell-sidebar-nav");
    if (!nav || nav.dataset.sidebarView === currentView) return;
    animateSwitch(nav, currentView);
  }, [currentView]);

  const handleSwitch = () => {
    setManual({
      key: matchKey,
      view: currentView === "main" ? "route" : "main",
    });
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
