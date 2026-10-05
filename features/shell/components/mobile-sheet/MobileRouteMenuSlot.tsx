"use client";

// MobileRouteMenuSlot — Client island for the mobile side sheet (Large Routes).
// Same lifecycle as RouteMenuSlot: match → import → auto-switch.
// Portals route menu content into .shell-mobile-route-nav.

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  routeMenuDefaultView,
  routeMenuRegistry,
  type RouteMenuEntry,
} from "../../constants/route-menu-registry";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import ShellIcon from "../ShellIcon";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

type SidebarView = "main" | "route";

function findMatch(pathname: string): RouteMenuEntry | null {
  for (const entry of routeMenuRegistry) {
    if (entry.pathPattern.test(pathname)) return entry;
  }
  return null;
}

export default function MobileRouteMenuSlot({
  showFullMenu = false,
}: {
  /**
   * The drawer's destination search is typing: its results live in the full
   * menu, so the drawer leaves the area's own menu for it.
   */
  showFullMenu?: boolean;
} = {}) {
  const pathname = usePathname();
  const [RouteMenu, setRouteMenu] = useState<ComponentType<{
    expanded: boolean;
  }> | null>(null);
  const match = findMatch(pathname);
  const matchKey = match?.pathPattern.source ?? null;

  // 🚨 A LARGE ROUTE'S DRAWER OPENS ON ITS ROUTE MENU (page-pass shared
  // defects, 2026-09-27) — never the main menu first, then a swap once the
  // menu chunk loads. The drawer mounts on open, so the view is set before
  // its first paint (layout effect) and the skeleton shows while it loads.
  const [loading, setLoading] = useState(!!match);
  // The route menu's chunk failed to load: the drawer falls back to the main
  // menu, the switch stays usable, and the route view says what happened.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [currentView, setCurrentView] = useState<SidebarView>(routeMenuDefaultView(match));
  const [routeNavTarget, setRouteNavTarget] = useState<HTMLElement | null>(
    null,
  );
  const matchRef = useRef<RouteMenuEntry | null>(null);
  // A family that opens on the main menu never auto-switches to its route menu.
  const hasAutoSwitched = useRef(!!match);

  // Mount only (a ref, not state): later flips go through the handlers below.
  const initialViewRef = useRef(currentView);
  useLayoutEffect(() => {
    const sheet = document.querySelector<HTMLElement>(".shell-mobile-sheet");
    if (sheet && !sheet.dataset.sidebarView) sheet.dataset.sidebarView = initialViewRef.current;
  }, []);

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
    if (routeMenuDefaultView(match) === "main") {
      setCurrentView("main");
      const sheet = document.querySelector<HTMLElement>(".shell-mobile-sheet");
      if (sheet) sheet.dataset.sidebarView = "main";
    }
    setRouteMenu(null);
    setLoading(true);
    setFailed(false);
    loadRouteMenu(match);
  }, [matchKey]);

  const showMainView = () => {
    const sheet = document.querySelector<HTMLElement>(".shell-mobile-sheet");
    if (sheet) sheet.dataset.sidebarView = "main";
    setCurrentView("main");
  };

  function loadRouteMenu(entry: RouteMenuEntry) {
    entry
      .importFn()
      .then((mod) => {
        if (matchRef.current !== entry) return;
        setRouteMenu(() => mod.default);
        setFailed(false);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (matchRef.current !== entry) return;
        captureError({
          source: "shell-navigation",
          message: `The ${entry.label} menu failed to load in the phone drawer`,
          details: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          callSite: "MobileRouteMenuSlot.loadRouteMenu",
          recoverable: true,
          raw: error,
        });
        setLoading(false);
        setFailed(true);
        // Never strand the drawer on a skeleton: the main menu always works.
        hasAutoSwitched.current = true;
        showMainView();
      });
  }

  useEffect(() => {
    if (showFullMenu && currentView === "route") showMainView();
  }, [showFullMenu]);

  // Retry is the attempt counter; a later attempt reloads the same entry.
  useEffect(() => {
    if (attempt === 0 || !matchRef.current) return;
    setLoading(true);
    setFailed(false);
    loadRouteMenu(matchRef.current);
  }, [attempt]);

  useEffect(() => {
    if (!RouteMenu || hasAutoSwitched.current) return;
    hasAutoSwitched.current = true;
    if (routeMenuDefaultView(match) === "main") return;
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

  const switchVisible = loading || failed || !!RouteMenu;
  // Constant swap glyph in BOTH views — see RouteMenuSlot for rationale. The
  // control reads identically in either menu so it's clearly one reversible
  // switch; only the destination label flips.
  // THE PHONE'S HALF OF THE DOMAIN PANEL: inside an area the drawer opens on
  // that area's own menu, with one step back to every area — the drill-in the
  // rest of the drawer uses, never a sideways "switch".
  const inArea = currentView === "route";
  const switchIconName = inArea ? "ChevronLeft" : "ChevronRight";
  const switchLabel = inArea ? "All areas" : match.label;

  return (
    <>
      {/* Switch button */}
      <button
        type="button"
        className="shell-mobile-switch"
        data-visible={switchVisible ? "true" : undefined}
        onClick={handleSwitch}
        disabled={loading}
        aria-label={inArea ? "Back to all areas" : `Open the ${match.label} menu`}
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
            {failed && !RouteMenu ? (
              <div className="flex items-center gap-3 px-3 py-4 type-body text-muted-foreground">
                <span className="min-w-0 flex-1">
                  The {match.label} menu didn&apos;t load.
                </span>
                <button
                  type="button"
                  data-keep-mobile-menu-open=""
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 font-medium text-foreground"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {RouteMenu && <RouteMenu expanded={true} />}
          </>,
          routeNavTarget,
        )}
    </>
  );
}
