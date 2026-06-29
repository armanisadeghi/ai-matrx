"use client";

// NavFlyoutGroup — Client island for a nav item with nested children.
//
// Collapsed sidebar:  parent is a plain icon Link → clicking navigates to the
//                     main route. Hovering opens the submenu flyout.
// Expanded sidebar:   parent is a row with a caret → hovering OR clicking opens
//                     the submenu flyout beside the rail (click pins it open).
//
// The submenu is a glass panel portaled to <body> and positioned to the right
// of the trigger (clamped to the viewport). Because it lives outside
// .shell-root, active state is computed in JS (usePathname) rather than the
// CSS data-pathname matching the rest of the shell uses.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import ShellIcon from "../ShellIcon";
import { useSidebarExpanded } from "../../hooks/useSidebarExpanded";
import {
  partitionNavChildren,
  type ShellNavChild,
  type ShellNavItem,
} from "../../constants/nav-data";
import { useNavActions } from "../../navigation/navActions";

interface NavFlyoutGroupProps {
  item: ShellNavItem;
  /**
   * Launcher groups (e.g. Favorites) aren't a route — their children duplicate
   * other nav items that already light up. Set this so the group never shows
   * active state, keeping the "one highlighted route at a time" rule intact.
   */
  suppressActive?: boolean;
}

const OPEN_DELAY = 90;
const CLOSE_DELAY = 240;

function isOnRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavFlyoutGroup({
  item,
  suppressActive = false,
}: NavFlyoutGroupProps) {
  const children = item.children ?? [];
  const expanded = useSidebarExpanded();
  const pathname = usePathname() ?? "";
  const navActions = useNavActions();

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPanel = open || pinned;

  // Active child = most specific matching href among siblings (so e.g. on
  // /transcripts/studio only "Studio" lights up, not "All Transcripts").
  const activeHref = children
    .filter((c) => isOnRoute(pathname, c.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isGroupActive =
    !suppressActive && (Boolean(activeHref) || isOnRoute(pathname, item.href));

  // Destinations up top (grouped), create actions collected at the bottom.
  const { sections, actions } = partitionNavChildren(children);

  // One renderer for both destinations and actions so they're pixel-identical.
  // Action entries trigger an overlay/window in place instead of navigating —
  // render a button, run the handler, and close the flyout. (Falls back to a
  // plain Link for navigation entries and action entries without a handler.)
  const renderChild = (child: ShellNavChild) => {
    const actionHandler = child.action ? navActions[child.action] : undefined;
    if (actionHandler) {
      return (
        <button
          key={child.action}
          type="button"
          role="menuitem"
          className="shell-nav-flyout-item"
          onClick={() => {
            actionHandler();
            setPinned(false);
            setOpen(false);
          }}
        >
          <span className="shell-nav-icon">
            <ShellIcon name={child.iconName} size={16} strokeWidth={1.75} />
          </span>
          <span>{child.label}</span>
        </button>
      );
    }
    return (
      <Link
        key={child.href}
        href={child.href}
        role="menuitem"
        className="shell-nav-flyout-item"
        data-active={child.href === activeHref ? "true" : undefined}
      >
        <span className="shell-nav-icon">
          <ShellIcon name={child.iconName} size={16} strokeWidth={1.75} />
        </span>
        <span>{child.label}</span>
      </Link>
    );
  };

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.top, left: rect.right + 6 });
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => {
      position();
      setOpen(true);
    }, OPEN_DELAY);
  }, [clearTimers, position]);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
    setPinned(false);
  }, [pathname]);

  // Clamp the panel inside the viewport once it's measured.
  useEffect(() => {
    if (!showPanel) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const margin = 8;
    if (rect.bottom > window.innerHeight - margin) {
      setCoords((c) => ({
        ...c,
        top: Math.max(margin, window.innerHeight - rect.height - margin),
      }));
    }
  }, [showPanel]);

  // Dismiss the pinned flyout on outside click / Escape.
  useEffect(() => {
    if (!pinned) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setPinned(false);
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // Expanded: clicking toggles/pins the flyout instead of navigating.
  // Collapsed: let the Link navigate to the main route.
  const handleParentClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return; // allow new-tab via href
    if (!expanded) return;
    e.preventDefault();
    position();
    setPinned((prev) => {
      const next = !prev;
      setOpen(next);
      return next;
    });
  };

  return (
    <div
      ref={triggerRef}
      className="shell-nav-flyout-group"
      data-nav-group={item.href}
      data-flyout-open={showPanel ? "true" : undefined}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <Link
        href={item.href}
        data-nav-href={suppressActive ? undefined : item.href}
        data-nav-active={isGroupActive ? "true" : undefined}
        className="shell-nav-item shell-tactile-subtle"
        aria-haspopup="menu"
        aria-expanded={showPanel}
        onClick={handleParentClick}
        onFocus={scheduleOpen}
      >
        <span className="shell-nav-icon">
          <ShellIcon name={item.iconName} size={18} strokeWidth={1.75} />
        </span>
        <span className="shell-nav-label">{item.label}</span>
        <ShellIcon
          name="ChevronRight"
          size={14}
          strokeWidth={2}
          className="shell-nav-flyout-caret"
        />
      </Link>

      {showPanel &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={item.label}
            className="shell-nav-flyout"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
            }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="shell-nav-flyout-header">{item.label}</div>
            {sections.map((section) => (
              <div key={section.label ?? section.items[0]?.href}>
                {section.label ? (
                  <div className="shell-nav-flyout-section">
                    {section.label}
                  </div>
                ) : null}
                {section.items.map(renderChild)}
              </div>
            ))}
            {actions.length > 0 && (
              <>
                {sections.length > 0 && (
                  <div
                    className="shell-nav-flyout-divider"
                    role="separator"
                    aria-orientation="horizontal"
                  />
                )}
                {actions.map(renderChild)}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
