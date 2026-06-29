"use client";
import React, { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LucideIcon, Check, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

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

  // Mobile
  forceMobileCenter?: boolean; // Force center positioning on mobile (legacy, ignored — always Drawer on mobile)

  // Callbacks
  onActionStart?: (key: string) => void;
  onActionSuccess?: (key: string) => void;
  onActionError?: (key: string, error: unknown) => void;
}

type ActionState = "idle" | "loading" | "success" | "error";

// ─── Shared item renderer ─────────────────────────────────────────────────────

interface MenuItemsContentProps {
  groupedItems: Record<string, MenuItem[]>;
  categorizeItems: boolean;
  actionStates: Record<string, ActionState>;
  onAction: (item: MenuItem) => void;
  getActionState: (key: string) => ActionState;
}

const MenuItemsContent: React.FC<MenuItemsContentProps> = ({
  groupedItems,
  categorizeItems,
  onAction,
  getActionState,
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
            const state = getActionState(item.key);
            const Icon = item.icon;
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
                className={cn(
                  "w-full flex items-center gap-2.5 px-2 py-0 rounded-md min-h-[32px]",
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
                      SOON
                    </span>
                  )}
                </div>
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
  onActionStart,
  onActionSuccess,
  onActionError,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>(
    {},
  );
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [hasScrollBelow, setHasScrollBelow] = useState(false);

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
  }, [isOpen, anchorElement, position, width, isMobile, items]);

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
      if (event.key === "Escape") onClose();
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
  const setActionState = (key: string, state: ActionState) => {
    setActionStates((prev) => ({ ...prev, [key]: state }));
    if (state === "success" || state === "error") {
      setTimeout(() => {
        setActionStates((prev) => ({ ...prev, [key]: "idle" }));
      }, 2000);
    }
  };

  const getActionState = (key: string): ActionState =>
    actionStates[key] || "idle";

  const handleAction = async (item: MenuItem) => {
    if (item.disabled) return;

    const state = getActionState(item.key);
    if (state === "loading") return;

    try {
      setActionState(item.key, "loading");
      onActionStart?.(item.key);

      const result = item.action();
      if (result instanceof Promise) await result;

      setActionState(item.key, "success");
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
      setActionState(item.key, "error");
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

  const groupedItems = React.useMemo(() => {
    const visible = items.filter((item) => !item.hidden);
    if (!categorizeItems) return { "": visible };

    return visible.reduce(
      (acc, item) => {
        const category = item.category || "Actions";
        if (!acc[category]) acc[category] = [];
        acc[category].push(item);
        return acc;
      },
      {} as Record<string, MenuItem[]>,
    );
  }, [items, categorizeItems]);

  const sharedItemProps: MenuItemsContentProps = {
    groupedItems,
    categorizeItems,
    actionStates,
    onAction: handleAction,
    getActionState,
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
          {showHeader && title ? (
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
            <MenuItemsContent {...sharedItemProps} />
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
        {/* Header */}
        {showHeader && title && (
          <div className="px-2.5 py-1.5 border-b border-zinc-200/60 dark:border-zinc-700/60 flex-shrink-0">
            <h3 className="text-[11px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {title}
            </h3>
          </div>
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
