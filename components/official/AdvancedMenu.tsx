"use client";
import React, { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LucideIcon,
  Check,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

export type MenuItemAction = () => void | Promise<void>;

export interface MenuItem {
  key: string;
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  description?: string;
  action: MenuItemAction;
  category?: string;
  disabled?: boolean;
  /** When true, item is omitted from the menu */
  hidden?: boolean;
  /**
   * Nested items. A row with children is a SUBMENU TRIGGER: it never runs an
   * action, it renders a visible "›" affordance and drills into its own panel
   * (with a back row). This is how a long family of variants — nine "Save as"
   * formats, four "Copy" formats — stays one visible row instead of nine or
   * four rows that push everything below them out of the viewport.
   */
  children?: MenuItem[];
  showToast?: boolean; // Default true
  successMessage?: string;
  errorMessage?: string;
  loadingMessage?: string;
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface AdvancedMenuProps {
  // Core
  isOpen: boolean;
  onClose: () => void;
  items: MenuItem[];

  // Header
  title?: string;
  description?: string;
  showHeader?: boolean; // Default true

  // Positioning
  position?:
    | "bottom-left"
    | "bottom-right"
    | "top-left"
    | "top-right"
    | "center";
  anchorElement?: HTMLElement | null;

  // Styling
  className?: string;
  width?: string; // Default "280px"
  maxWidth?: string; // Default "320px"

  // Behavior
  closeOnAction?: boolean; // Default true
  showBackdrop?: boolean; // Default true
  backdropBlur?: boolean; // Default true
  categorizeItems?: boolean; // Default true if items have categories
  /**
   * Overflow safety net (default true). When a menu would render more than
   * `AUTO_COLLAPSE_THRESHOLD` visible rows, every category after the first is
   * collapsed into a single submenu row so no group can end up buried tens of
   * rows below the fold. Pass false only for a menu that must stay flat.
   */
  autoCollapse?: boolean;

  // Mobile
  forceMobileCenter?: boolean; // Force center positioning on mobile (legacy, ignored — always Drawer on mobile)

  // Callbacks
  onActionStart?: (key: string) => void;
  onActionSuccess?: (key: string) => void;
  onActionError?: (key: string, error: unknown) => void;
}

type DirectiveState = "idle" | "loading" | "success" | "error";

// ─── Shared item renderer ─────────────────────────────────────────────────────

interface MenuItemsContentProps {
  groupedItems: Record<string, MenuItem[]>;
  categorizeItems: boolean;
  actionStates: Record<string, DirectiveState>;
  onAction: (item: MenuItem) => void;
  getDirectiveState: (key: string) => DirectiveState;
  mobile?: boolean;
}

/**
 * Above this many visible rows a categorized menu auto-collapses its
 * non-primary categories into submenu rows. ~17 rows is all that fits in the
 * 600px desktop panel on a 768px-tall viewport, so anything past that is
 * invisible unless the user guesses to scroll.
 */
export const AUTO_COLLAPSE_THRESHOLD = 20;

/** Build the root row list, collapsing overflow categories into submenus. */
export function buildRootItems(
  items: MenuItem[],
  categorizeItems: boolean,
  autoCollapse: boolean,
): MenuItem[] {
  const visible = items.filter((item) => !item.hidden);
  if (!autoCollapse || !categorizeItems) return visible;
  if (visible.length <= AUTO_COLLAPSE_THRESHOLD) return visible;

  const groups = new Map<string, MenuItem[]>();
  for (const item of visible) {
    const category = item.category || "Actions";
    const bucket = groups.get(category);
    if (bucket) bucket.push(item);
    else groups.set(category, [item]);
  }

  const entries = Array.from(groups.entries());
  if (entries.length < 2) return visible;

  const [primaryName, primaryItems] = entries[0];
  const collapsed = entries.slice(1).map(([name, groupItems]) => ({
    key: `__group__${name}`,
    icon: groupItems[0].icon,
    label: name,
    action: () => {},
    // Same category as the primary group so the panel renders as one
    // uninterrupted list rather than a header per collapsed row.
    category: primaryName,
    children: groupItems,
  }));

  return [...primaryItems, ...collapsed];
}

const MenuItemsContent: React.FC<MenuItemsContentProps> = ({
  groupedItems,
  categorizeItems,
  onAction,
  getDirectiveState,
  mobile = false,
}) => (
  <>
    {Object.entries(groupedItems).map(([category, categoryItems], catIndex) => (
      <div key={category}>
        {categorizeItems && category && catIndex > 0 && (
          <div className="px-2.5 pt-2 pb-0.5">
            <h4 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {category}
            </h4>
          </div>
        )}

        <div className="px-1.5 py-0.5">
          {categoryItems.map((item) => {
            const state = getDirectiveState(item.key);
            const Icon = item.icon;
            const hasChildren = !!item.children?.length;
            const isLoading = state === "loading";
            const isSuccess = state === "success";
            const isError = state === "error";
            const isDisabled = item.disabled || isLoading;

            return (
              <button
                key={item.key}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDisabled) onAction(item);
                }}
                disabled={isDisabled}
                aria-haspopup={hasChildren ? "menu" : undefined}
                data-submenu-trigger={hasChildren ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-0",
                  mobile ? "min-h-11" : "min-h-8",
                  "text-left transition-all duration-150",
                  isDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800/70 active:scale-[0.98] cursor-pointer",
                  isSuccess && "bg-green-50 dark:bg-green-900/20",
                  isError && "bg-red-50 dark:bg-red-900/20",
                  "group",
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    "flex-shrink-0 transition-transform duration-150",
                    !isDisabled && "group-hover:scale-110",
                  )}
                >
                  {isLoading ? (
                    <Loader2
                      size={15}
                      className="animate-spin text-gray-400 dark:text-gray-500"
                    />
                  ) : isSuccess ? (
                    <Check
                      size={15}
                      className="text-green-500 dark:text-green-400"
                    />
                  ) : (
                    <Icon
                      size={15}
                      className={
                        item.iconColor || "text-gray-600 dark:text-gray-400"
                      }
                    />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "text-[13px] font-medium",
                      isSuccess && "text-green-700 dark:text-green-300",
                      isError && "text-red-700 dark:text-red-300",
                      !isSuccess &&
                        !isError &&
                        "text-gray-900 dark:text-gray-100",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.disabled && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-400 font-medium">
                      UNAVAILABLE
                    </span>
                  )}
                </div>

                {/* Submenu affordance — the row says out loud that more sits
                    behind it, with the count so nothing is a surprise. */}
                {hasChildren && (
                  <div className="flex-shrink-0 flex items-center gap-1 text-gray-400 dark:text-gray-500">
                    <span className="text-[11px] tabular-nums">
                      {item.children!.filter((child) => !child.hidden).length}
                    </span>
                    <ChevronRight size={14} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </>
);

// ─── Main component ───────────────────────────────────────────────────────────

const AdvancedMenu: React.FC<AdvancedMenuProps> = ({
  isOpen,
  onClose,
  items,
  title = "Options",
  description,
  showHeader = true,
  position = "bottom-left",
  anchorElement,
  className = "",
  width = "280px",
  maxWidth = "320px",
  closeOnAction = true,
  showBackdrop = true,
  backdropBlur = true,
  categorizeItems = true,
  autoCollapse = true,
  onActionStart,
  onActionSuccess,
  onActionError,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [actionStates, setDirectiveStates] = useState<Record<string, DirectiveState>>(
    {},
  );
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [hasScrollBelow, setHasScrollBelow] = useState(false);
  /** Drill-in path: each entry is the submenu trigger the user opened. */
  const [trail, setTrail] = useState<MenuItem[]>([]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Calculate desktop menu position with viewport-aware clamping
  useEffect(() => {
    if (!isOpen || !anchorElement || isMobile) {
      setMenuPosition(null);
      return;
    }

    const compute = () => {
      if (!menuRef.current) return;

      const rect = anchorElement.getBoundingClientRect();
      const menuWidth = parseInt(width) || 280;
      const gap = 8;
      const edgePadding = 12;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Max height the menu can ever be: viewport minus padding on both sides
      const maxAllowedHeight = viewportHeight - edgePadding * 2;

      // Actual rendered height, capped at max
      const renderedHeight = Math.min(
        menuRef.current.scrollHeight || menuRef.current.offsetHeight || 200,
        maxAllowedHeight,
      );

      let top = 0;
      let left = 0;

      if (position === "center") {
        top = Math.max(edgePadding, (viewportHeight - renderedHeight) / 2);
        left = Math.max(edgePadding, (viewportWidth - menuWidth) / 2);
        setMenuPosition({ top, left });
        return;
      }

      const preferBottom = position.includes("bottom");
      const spaceBelow = viewportHeight - rect.bottom - gap - edgePadding;
      const spaceAbove = rect.top - gap - edgePadding;

      if (preferBottom && spaceBelow >= renderedHeight) {
        top = rect.bottom + gap;
      } else if (!preferBottom && spaceAbove >= renderedHeight) {
        top = rect.top - renderedHeight - gap;
      } else if (spaceBelow > spaceAbove) {
        // Open below — menu will scroll internally if too tall
        top = rect.bottom + gap;
      } else {
        // Open above
        top = rect.top - renderedHeight - gap;
      }

      // Clamp vertically so menu always stays within viewport
      top = Math.max(
        edgePadding,
        Math.min(top, viewportHeight - renderedHeight - edgePadding),
      );

      const preferRight = position.includes("right");
      left = preferRight ? rect.right - menuWidth : rect.left;

      // Clamp horizontally
      left = Math.max(
        edgePadding,
        Math.min(left, viewportWidth - menuWidth - edgePadding),
      );

      setMenuPosition({ top, left });
    };

    // Double-RAF ensures menu is laid out before measuring
    requestAnimationFrame(() => requestAnimationFrame(compute));
  }, [isOpen, anchorElement, position, width, isMobile, items, trail.length]);

  // A reopened menu always starts at the top level.
  useEffect(() => {
    if (!isOpen) setTrail([]);
  }, [isOpen]);

  // Close on outside click (desktop only — Drawer handles its own backdrop)
  useEffect(() => {
    if (!isOpen || isMobile) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, isMobile]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Inside a submenu, Escape goes back one level before it closes.
      setTrail((prev) => {
        if (prev.length) return prev.slice(0, -1);
        onClose();
        return prev;
      });
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Track whether there is hidden content below the scroll area
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const check = () => {
      setHasScrollBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    };

    check();
    el.addEventListener("scroll", check, { passive: true });

    // Re-check when content changes (resize observer)
    const ro = new ResizeObserver(check);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [isOpen, mounted]);

  // Action state management
  const setDirectiveState = (key: string, state: DirectiveState) => {
    setDirectiveStates((prev) => ({ ...prev, [key]: state }));
    if (state === "success" || state === "error") {
      setTimeout(() => {
        setDirectiveStates((prev) => ({ ...prev, [key]: "idle" }));
      }, 2000);
    }
  };

  const getDirectiveState = (key: string): DirectiveState =>
    actionStates[key] || "idle";

  const handleAction = async (item: MenuItem) => {
    if (item.disabled) return;

    // Submenu trigger — drill in, never run an action, never close.
    if (item.children?.length) {
      setTrail((prev) => [...prev, item]);
      return;
    }

    const state = getDirectiveState(item.key);
    if (state === "loading") return;

    try {
      setDirectiveState(item.key, "loading");
      onActionStart?.(item.key);

      const result = item.action();
      if (result instanceof Promise) await result;

      setDirectiveState(item.key, "success");
      onActionSuccess?.(item.key);

      if (item.showToast !== false) {
        toast({
          title: "Success",
          description: item.successMessage || `${item.label} completed`,
        });
      }

      if (closeOnAction) {
        setTimeout(() => onClose(), 500);
      }
    } catch (error) {
      if (isOrganizationSelectionCancelled(error)) {
        setDirectiveState(item.key, "idle");
        return;
      }
      setDirectiveState(item.key, "error");
      onActionError?.(item.key, error);

      if (item.showToast !== false) {
        toast({
          title: "Error",
          description: item.errorMessage || `${item.label} failed`,
          variant: "destructive",
        });
      }
    }
  };

  const rootItems = React.useMemo(
    () => buildRootItems(items, categorizeItems, autoCollapse),
    [items, categorizeItems, autoCollapse],
  );

  const activeParent = trail.length ? trail[trail.length - 1] : null;

  const activeItems = React.useMemo(
    () =>
      activeParent
        ? (activeParent.children ?? []).filter((item) => !item.hidden)
        : rootItems,
    [activeParent, rootItems],
  );

  const groupedItems = React.useMemo(() => {
    if (!categorizeItems) return { "": activeItems };

    return activeItems.reduce(
      (acc, item) => {
        const category = item.category || "Actions";
        if (!acc[category]) acc[category] = [];
        acc[category].push(item);
        return acc;
      },
      {} as Record<string, MenuItem[]>,
    );
  }, [activeItems, categorizeItems]);

  const goBack = () => setTrail((prev) => prev.slice(0, -1));

  const sharedItemProps: MenuItemsContentProps = {
    groupedItems,
    categorizeItems,
    actionStates,
    onAction: handleAction,
    getDirectiveState,
  };

  if (!mounted) return null;

  // ── Mobile: iOS-style bottom sheet ────────────────────────────────────────
  if (isMobile) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          {/* Drag handle is rendered by DrawerContent automatically */}

          {/* Header — DrawerTitle always rendered for a11y; visually hidden when showHeader is false */}
          {activeParent ? (
            <div className="px-2 pt-1 pb-2 border-b border-zinc-200/60 dark:border-zinc-700/60 flex-shrink-0">
              <button
                type="button"
                onClick={goBack}
                className="flex w-full items-center gap-2 rounded-md px-2 min-h-11 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
              >
                <ChevronLeft
                  size={16}
                  className="text-gray-500 dark:text-gray-400"
                />
                <DrawerTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                  {activeParent.label}
                </DrawerTitle>
              </button>
            </div>
          ) : showHeader && title ? (
            <div className="px-4 pt-1 pb-3 border-b border-zinc-200/60 dark:border-zinc-700/60 flex-shrink-0">
              <DrawerTitle className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 text-center">
                {title}
              </DrawerTitle>
              {description && (
                <p className="text-[13px] text-gray-500 dark:text-gray-400 text-center mt-1">
                  {description}
                </p>
              )}
            </div>
          ) : (
            <DrawerTitle className="sr-only">{title || "Options"}</DrawerTitle>
          )}

          {/* Scrollable content — single scroll area, no nesting */}
          <div className="flex-1 overflow-y-auto overscroll-contain py-2 pb-safe">
            <MenuItemsContent {...sharedItemProps} mobile />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // ── Desktop: positioned popup with scroll ─────────────────────────────────
  if (!isOpen) return null;

  // Viewport-relative max height so items are always reachable via scroll
  const desktopMaxHeight = "min(calc(100dvh - 24px), 600px)";

  const menuContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {/* Backdrop */}
      {showBackdrop && (
        <div
          style={{ pointerEvents: "auto", zIndex: 1 }}
          className={cn(
            "fixed inset-0 bg-black/20 dark:bg-black/40",
            backdropBlur && "backdrop-blur-[2px]",
          )}
          onClick={onClose}
        />
      )}

      {/* Menu panel */}
      <div
        ref={menuRef}
        style={{
          minWidth: width,
          maxWidth,
          maxHeight: desktopMaxHeight,
          zIndex: 2,
          pointerEvents: "auto",
          position: "fixed",
          visibility: menuPosition ? "visible" : "hidden",
          top: menuPosition ? `${menuPosition.top}px` : undefined,
          left: menuPosition ? `${menuPosition.left}px` : undefined,
        }}
        className={cn(
          "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm",
          "shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]",
          "rounded-lg border border-zinc-300 dark:border-zinc-600",
          "flex flex-col",
          "overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200",
          className,
        )}
      >
        {/* Header — a back row whenever the user has drilled into a submenu,
            so the way out is always on screen. */}
        {activeParent ? (
          <button
            type="button"
            onClick={goBack}
            className="flex w-full items-center gap-1.5 px-2 py-1.5 border-b border-zinc-200/60 dark:border-zinc-700/60 flex-shrink-0 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
          >
            <ChevronLeft
              size={14}
              className="text-gray-500 dark:text-gray-400"
            />
            <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {activeParent.label}
            </span>
          </button>
        ) : (
          showHeader &&
          title && (
            <div className="px-2.5 py-1.5 border-b border-zinc-200/60 dark:border-zinc-700/60 flex-shrink-0">
              <h3 className="text-[11px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                {title}
              </h3>
            </div>
          )
        )}

        {/* Scrollable items — relative so the fade overlay sits inside */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-600 scrollbar-track-transparent py-0.5"
          >
            <MenuItemsContent {...sharedItemProps} />
          </div>

          {/* Scroll-more fade — only visible when content is cut off below */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-0 inset-x-0 h-8",
              "bg-gradient-to-t from-white/95 dark:from-zinc-900/95 to-transparent",
              "transition-opacity duration-200",
              hasScrollBelow ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default AdvancedMenu;
