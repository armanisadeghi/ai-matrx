"use client";

// NavFlyoutGroup — Client island for a nav item with nested children.
//
// The parent label/icon is always a route link. Its separate disclosure button
// opens the submenu flyout, so the same route is reachable at either rail
// width without stealing native link behavior (new tab, keyboard activation).
//
// The flyout is a panel portaled to <body> and positioned to the right of the
// trigger (clamped to the viewport). Because it lives outside .shell-root,
// active state is computed in JS (usePathname) rather than the CSS
// data-pathname matching the rest of the shell uses.
//
// THE THIRD LEVEL (Arman, 2026-10-02). A child that carries its own `children`
// is a sub-area (an industry, a part of Media). Its row navigates to its
// landing when its NAME is clicked; hovering the row, clicking its chevron, or
// pressing ArrowRight opens its menu as a second panel beside the flyout.
// Hover intent: the submenu opens after a short delay and closes after a
// longer one, so a diagonal move from the row into the submenu (crossing other
// rows) never closes it. Escape / ArrowLeft step back one level.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import AppLink from "@/components/navigation/AppLink";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import ShellIcon from "../ShellIcon";
import {
  NAV_WINDOW_PANEL_ICON,
  navChildHasSubmenu,
  navToneIconClass,
  partitionNavChildren,
  type ShellNavChild,
  type ShellNavItem,
} from "../../constants/nav-data";
import { useNavActions } from "../../navigation/navActions";
import { useNavPanelActions } from "../../navigation/navPanelActions";
import {
  findActiveNavBranch,
  findActiveNavChild,
  isExclusiveNavGroupActive,
} from "../../utils/is-nav-group-active";
import { cn } from "@/lib/utils";

interface NavFlyoutGroupProps {
  item: ShellNavItem;
  /**
   * Sibling groups used to pick the single most-specific owner. Required so a
   * placeholder that borrows another module's href cannot light up beside it.
   */
  candidates: readonly ShellNavItem[];
  /**
   * Launcher groups (e.g. Favorites) aren't a route — their children duplicate
   * other nav items that already light up. Set this so the group never shows
   * active state, keeping the "one highlighted route at a time" rule intact.
   */
  suppressActive?: boolean;
}

const OPEN_DELAY = 90;
const CLOSE_DELAY = 240;
/** A submenu waits a beat before opening so a diagonal pass doesn't switch it. */
const SUB_OPEN_DELAY = 140;
/** …and lingers long enough for the pointer to cross into it. */
const SUB_CLOSE_DELAY = 320;
/**
 * While a submenu is open, leaving a menu for empty space waits this long: a
 * tall submenu clamps upward, so the pointer's diagonal path from its row
 * crosses open screen before it lands (owner, 2026-10-03: the Education menu
 * "closes before you can use it"). Entering either menu cancels the wait.
 */
const SUB_LEAVE_GRACE = 700;
const VIEWPORT_MARGIN = 8;

function childKey(child: ShellNavChild): string {
  return `${child.panelAction ?? child.action ?? child.href}::${child.label}`;
}

/** Arrow-key focus movement among a panel's menu items. */
function moveFocus(panel: HTMLElement | null, direction: 1 | -1): void {
  if (!panel) return;
  const items = Array.from(
    panel.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  );
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next =
    index === -1
      ? direction === 1
        ? 0
        : items.length - 1
      : (index + direction + items.length) % items.length;
  items[next]?.focus();
}

function focusFirstItem(panel: HTMLElement | null): void {
  panel?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
}

export default function NavFlyoutGroup({
  item,
  candidates,
  suppressActive = false,
}: NavFlyoutGroupProps) {
  const children = item.children ?? [];
  const pathname = usePathname() ?? "";
  // Gated destinations (Make, Records) appear where their switch is on.
  const navActions = useNavActions();
  const navPanelActions = useNavPanelActions();

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // The open sub-area (third level), where its panel sits, and whether a click
  // pinned it (a pinned submenu ignores pointer-leave).
  const [subKey, setSubKey] = useState<string | null>(null);
  const [subPinned, setSubPinned] = useState(false);
  const [subCoords, setSubCoords] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLDivElement>(null);
  const triggerLinkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const subPanelRef = useRef<HTMLDivElement>(null);
  const subRowRefs = useRef(new Map<string, HTMLDivElement>());
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusPanelOnOpen = useRef(false);
  const focusSubOnOpen = useRef(false);
  /** Focus handed BACK to the rail row (Escape) must not reopen the flyout. */
  const skipFocusOpen = useRef(false);

  const showPanel = open || pinned;
  const subArea = showPanel
    ? children.find(
        (child) => navChildHasSubmenu(child) && childKey(child) === subKey,
      )
    : undefined;

  // The row on the way to the active route at this level (a sub-area lights
  // up while one of its own rows is the current page).
  const activeBranch = findActiveNavBranch(pathname, item);
  const activeSubLeaf = subArea
    ? findActiveNavChild(pathname, subArea)
    : undefined;
  const isGroupActive =
    !suppressActive && isExclusiveNavGroupActive(pathname, item, candidates);

  const clearSubTimers = useCallback(() => {
    if (subOpenTimer.current) {
      clearTimeout(subOpenTimer.current);
      subOpenTimer.current = null;
    }
    if (subCloseTimer.current) {
      clearTimeout(subCloseTimer.current);
      subCloseTimer.current = null;
    }
  }, []);

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

  const closeSub = useCallback(() => {
    clearSubTimers();
    focusSubOnOpen.current = false;
    setSubKey(null);
    setSubPinned(false);
  }, [clearSubTimers]);

  const closeAll = useCallback(() => {
    clearTimers();
    closeSub();
    setPinned(false);
    setOpen(false);
  }, [clearTimers, closeSub]);

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const panelHeight = panelRef.current?.getBoundingClientRect().height;
    const top = panelHeight
      ? Math.max(
          VIEWPORT_MARGIN,
          Math.min(rect.top, window.innerHeight - panelHeight - VIEWPORT_MARGIN),
        )
      : rect.top;
    setCoords({ top, left: rect.right + 6 });
  }, []);

  /** Opens a sub-area's menu beside its row. */
  const openSub = useCallback(
    (key: string, { focus = false }: { focus?: boolean } = {}) => {
      clearSubTimers();
      // Already open (hover got there first): the panel is mounted, so move
      // focus in now. Setting the pending flag here would never be consumed —
      // subKey does not change — and would steal focus on a later open.
      if (subKey === key) {
        focusSubOnOpen.current = false;
        if (focus) focusFirstItem(subPanelRef.current);
        return;
      }
      const row = subRowRefs.current.get(key);
      const panel = panelRef.current;
      if (!row || !panel) return;
      const rowRect = row.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      focusSubOnOpen.current = focus;
      setSubCoords({ top: rowRect.top - 4, left: panelRect.right + 4 });
      setSubKey(key);
    },
    [clearSubTimers, subKey],
  );

  const scheduleSubOpen = useCallback(
    (key: string) => {
      if (subCloseTimer.current) {
        clearTimeout(subCloseTimer.current);
        subCloseTimer.current = null;
      }
      if (subKey === key) return;
      if (subOpenTimer.current) clearTimeout(subOpenTimer.current);
      // A pinned submenu (opened by a click) waits for a click elsewhere.
      if (subPinned) return;
      subOpenTimer.current = setTimeout(() => openSub(key), SUB_OPEN_DELAY);
    },
    [openSub, subKey, subPinned],
  );

  const scheduleSubClose = useCallback((delay: number = SUB_CLOSE_DELAY) => {
    if (subOpenTimer.current) {
      clearTimeout(subOpenTimer.current);
      subOpenTimer.current = null;
    }
    if (subPinned) return;
    if (subCloseTimer.current) clearTimeout(subCloseTimer.current);
    subCloseTimer.current = setTimeout(() => setSubKey(null), delay);
  }, [subPinned]);

  /** Leaving a menu for open screen while a submenu is up: the long grace. */
  const scheduleSubLeave = useCallback(() => scheduleSubClose(SUB_LEAVE_GRACE), [scheduleSubClose]);

  const cancelSubClose = useCallback(() => {
    if (subOpenTimer.current) {
      clearTimeout(subOpenTimer.current);
      subOpenTimer.current = null;
    }
    if (subCloseTimer.current) {
      clearTimeout(subCloseTimer.current);
      subCloseTimer.current = null;
    }
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
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), subKey ? SUB_LEAVE_GRACE : CLOSE_DELAY);
  }, [subKey]);

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
    setSubKey(null);
    setSubPinned(false);
  }, [pathname]);

  // A closed flyout takes its submenu with it.
  useEffect(() => {
    if (!showPanel) {
      setSubKey(null);
      setSubPinned(false);
    }
  }, [showPanel]);

  // Clamp the panel inside the viewport once it's measured; move focus into
  // it when it was opened from the keyboard. Layout effect: the clamp lands
  // before the first paint, so the panel never appears at its unclamped spot
  // and jumps while its entry animation plays.
  useLayoutEffect(() => {
    if (!showPanel) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - VIEWPORT_MARGIN) {
      setCoords((c) => ({
        ...c,
        top: Math.max(
          VIEWPORT_MARGIN,
          window.innerHeight - rect.height - VIEWPORT_MARGIN,
        ),
      }));
    }
    if (focusPanelOnOpen.current) {
      focusPanelOnOpen.current = false;
      focusFirstItem(panel);
    }
  }, [showPanel]);

  // Keep the submenu on screen: flip it up near the viewport bottom, and to
  // the flyout's left when there is no room on its right. It scrolls (CSS
  // max-height) when it is taller than the viewport. Layout effect so the
  // flipped position is the first painted frame.
  useLayoutEffect(() => {
    if (!subKey) return;
    const sub = subPanelRef.current;
    const panel = panelRef.current;
    if (!sub || !panel) return;
    const rect = sub.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    setSubCoords((c) => {
      let { top, left } = c;
      if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
        top = Math.max(
          VIEWPORT_MARGIN,
          window.innerHeight - rect.height - VIEWPORT_MARGIN,
        );
      }
      if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
        left = Math.max(VIEWPORT_MARGIN, panelRect.left - rect.width - 4);
      }
      return top === c.top && left === c.left ? c : { top, left };
    });
    if (focusSubOnOpen.current) {
      focusSubOnOpen.current = false;
      focusFirstItem(sub);
    }
  }, [subKey]);

  // Dismiss on outside click / Escape while anything is pinned.
  useEffect(() => {
    if (!pinned && !subPinned) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (subPanelRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) {
        // A click elsewhere in the flyout releases a pinned submenu.
        const inSubRow = Array.from(subRowRefs.current.values()).some((row) =>
          row.contains(target),
        );
        if (!inSubRow) {
          setSubPinned(false);
          setSubKey(null);
        }
        return;
      }
      closeAll();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (subKey) closeSub();
      else closeAll();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned, subPinned, subKey, closeAll, closeSub]);

  useEffect(
    () => () => {
      clearTimers();
      clearSubTimers();
    },
    [clearTimers, clearSubTimers],
  );

  const toggleFlyout = () => {
    position();
    setPinned((prev) => {
      const next = !prev;
      setOpen(next);
      return next;
    });
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // The panels are portaled, but React bubbles their keys through this
    // element too — only keys pressed on the rail row itself belong here.
    if (!triggerRef.current?.contains(e.target as Node)) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      clearTimers();
      if (showPanel) {
        focusFirstItem(panelRef.current);
      } else {
        focusPanelOnOpen.current = true;
        position();
        setOpen(true);
      }
    } else if (e.key === "Escape" && showPanel) {
      e.preventDefault();
      closeAll();
    }
  };

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(panelRef.current, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "ArrowRight") {
      const row = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-sub-key]",
      );
      const key = row?.dataset.subKey;
      if (key) {
        e.preventDefault();
        openSub(key, { focus: true });
      }
    } else if (e.key === "Escape" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && subKey) {
        closeSub();
        return;
      }
      closeAll();
      skipFocusOpen.current = true;
      triggerLinkRef.current?.focus();
    }
  };

  const onRowFocus = () => {
    if (skipFocusOpen.current) {
      skipFocusOpen.current = false;
      return;
    }
    scheduleOpen();
  };

  const onSubKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(subPanelRef.current, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Escape" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      const key = subKey;
      closeSub();
      if (key) {
        subRowRefs.current
          .get(key)
          ?.querySelector<HTMLElement>('[role="menuitem"]')
          ?.focus();
      }
    }
  };

  // One renderer for both destinations and actions so they're pixel-identical.
  // Action entries trigger an overlay/window in place instead of navigating —
  // render a button, run the handler, and close the flyout. (Falls back to a
  // plain Link for navigation entries and action entries without a handler.)
  // `inSubmenu`: a row INSIDE an open submenu must never schedule that same
  // submenu's close — only a sibling row in the parent menu does (pointing at
  // anything in the Education submenu used to close it 320ms later).
  const renderChild = (child: ShellNavChild, activeHref?: string, inSubmenu = false) => {
    const closeSubOnEnter = subKey && !inSubmenu ? () => scheduleSubClose() : undefined;
    const panelHandler = child.panelAction
      ? navPanelActions[child.panelAction]
      : undefined;
    if (panelHandler) {
      return (
        <button
          key={childKey(child)}
          type="button"
          role="menuitem"
          className="shell-nav-flyout-item"
          onClick={() => {
            panelHandler();
            closeAll();
          }}
        >
          <span className="shell-nav-icon">
            <ShellIcon
              name={NAV_WINDOW_PANEL_ICON}
              size={16}
              strokeWidth={1.75}
            />
          </span>
          <span>{child.label}</span>
        </button>
      );
    }

    const actionHandler = child.action ? navActions[child.action] : undefined;
    if (actionHandler) {
      return (
        <button
          key={childKey(child)}
          type="button"
          role="menuitem"
          className="shell-nav-flyout-item"
          onClick={() => {
            actionHandler();
            closeAll();
          }}
        >
          <span className="shell-nav-icon">
            <ShellIcon name={child.iconName} size={16} strokeWidth={1.75} />
          </span>
          <span>{child.label}</span>
        </button>
      );
    }
    if (child.external || child.openInNewTab) {
      // A separately hosted app, or a launcher that stays open while what it
      // launches opens beside it: a real new tab, never an in-app transition.
      return (
        <a
          key={childKey(child)}
          href={child.href}
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          className="shell-nav-flyout-item"
          onMouseEnter={closeSubOnEnter}
          onClick={closeAll}
        >
          <span className="shell-nav-icon">
            <ShellIcon name={child.iconName} size={16} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1 truncate">{child.label}</span>
          <ShellIcon
            name="ArrowUpRight"
            size={12}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground"
          />
        </a>
      );
    }
    return (
      <AppLink
        key={childKey(child)}
        href={child.href}
        role="menuitem"
        className="shell-nav-flyout-item"
        data-active={child.href === activeHref ? "true" : undefined}
        onMouseEnter={closeSubOnEnter}
        onClick={closeAll}
      >
        <span className="shell-nav-icon">
          <ShellIcon name={child.iconName} size={16} strokeWidth={1.75} />
        </span>
        <span>{child.label}</span>
      </AppLink>
    );
  };

  /** A sub-area row: its name navigates, hovering / its chevron opens its menu. */
  const renderSubAreaRow = (child: ShellNavChild) => {
    const key = childKey(child);
    const isOpen = subKey === key;
    const isActive = activeBranch === child;
    return (
      <div
        key={key}
        ref={(el) => {
          if (el) subRowRefs.current.set(key, el);
          else subRowRefs.current.delete(key);
        }}
        data-sub-key={key}
        className="relative"
        onMouseEnter={() => scheduleSubOpen(key)}
        onMouseLeave={scheduleSubLeave}
      >
        <AppLink
          href={child.href}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className={cn(
            "shell-nav-flyout-item pr-8",
            isOpen && !isActive && "bg-accent text-accent-foreground",
          )}
          data-active={isActive ? "true" : undefined}
          onClick={closeAll}
        >
          <span className="shell-nav-icon">
            <ShellIcon name={child.iconName} size={16} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1 truncate">{child.label}</span>
        </AppLink>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Open ${child.label} menu`}
          className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={() => {
            if (isOpen && subPinned) {
              closeSub();
              return;
            }
            openSub(key);
            setSubPinned(true);
          }}
        >
          <ShellIcon name="ChevronRight" size={14} strokeWidth={2} />
        </button>
      </div>
    );
  };

  /** The sections / windows / create layout every menu panel shares. */
  const renderMenuBody = (
    label: string,
    menuChildren: ShellNavChild[],
    activeHref: string | undefined,
    allowSubAreas: boolean,
  ) => {
    // Destinations up top (grouped), create actions collected at the bottom.
    const { sections, panels, actions } = partitionNavChildren(menuChildren);
    return (
      <>
        <div className="shell-nav-flyout-header">{label}</div>
        {sections.map((section) => (
          <div key={section.label ?? section.items[0]?.href}>
            {/* A section named like the menu itself would repeat the header. */}
            {section.label &&
            section.label.toLowerCase() !== label.toLowerCase() ? (
              <div className="shell-nav-flyout-section">{section.label}</div>
            ) : null}
            {section.items.map((child) =>
              allowSubAreas && navChildHasSubmenu(child)
                ? renderSubAreaRow(child)
                : renderChild(child, activeHref, !allowSubAreas),
            )}
          </div>
        ))}
        {panels.length > 0 && (
          <>
            {sections.length > 0 && (
              <div
                className="shell-nav-flyout-divider"
                role="separator"
                aria-orientation="horizontal"
              />
            )}
            {panels.map((child) => renderChild(child, activeHref, !allowSubAreas))}
          </>
        )}
        {actions.length > 0 && (
          <>
            {(sections.length > 0 || panels.length > 0) && (
              <div
                className="shell-nav-flyout-divider"
                role="separator"
                aria-orientation="horizontal"
              />
            )}
            {actions.map((child) => renderChild(child, activeHref, !allowSubAreas))}
          </>
        )}
      </>
    );
  };

  return (
    <div
      ref={triggerRef}
      className="shell-nav-flyout-group"
      data-nav-group={item.href}
      data-flyout-open={showPanel ? "true" : undefined}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onKeyDown={onTriggerKeyDown}
    >
      <AppLink
        ref={triggerLinkRef}
        href={item.href}
        data-nav-href={suppressActive ? undefined : item.href}
        data-nav-active={isGroupActive ? "true" : undefined}
        aria-current={isGroupActive ? "page" : undefined}
        className={cn(
          "shell-nav-item shell-nav-group-link shell-tactile-subtle",
          isGroupActive && "shell-active-pill",
        )}
        onFocus={onRowFocus}
      >
        <span className={cn("shell-nav-icon", navToneIconClass(item.tone))}>
          <ShellIcon name={item.iconName} size={18} strokeWidth={1.75} />
        </span>
        <span className="shell-nav-label">{item.label}</span>
      </AppLink>
      <button
        type="button"
        className="shell-nav-group-disclosure shell-tactile-subtle"
        aria-label={`Open ${item.label} menu`}
        aria-haspopup="menu"
        aria-expanded={showPanel}
        onClick={toggleFlyout}
        onFocus={onRowFocus}
      >
        <ShellIcon
          name="ChevronRight"
          size={14}
          strokeWidth={2}
          className="shell-nav-flyout-caret"
        />
      </button>

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
            onKeyDown={onPanelKeyDown}
          >
            {renderMenuBody(
              item.label,
              children,
              activeBranch?.href,
              true,
            )}
          </div>,
          document.body,
        )}

      {subArea &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={subPanelRef}
            role="menu"
            aria-label={subArea.label}
            className="shell-nav-flyout"
            data-nav-submenu=""
            style={{
              position: "fixed",
              top: subCoords.top,
              left: subCoords.left,
              zIndex: 10000,
            }}
            onMouseEnter={() => {
              cancelClose();
              cancelSubClose();
            }}
            onMouseLeave={() => {
              scheduleSubLeave();
              scheduleClose();
            }}
            onKeyDown={onSubKeyDown}
          >
            {renderMenuBody(
              subArea.label,
              subArea.children ?? [],
              activeSubLeaf?.href,
              false,
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
