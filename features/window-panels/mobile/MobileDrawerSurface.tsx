"use client";

/**
 * MobileDrawerSurface — mobile presentation for a window with
 * `mobilePresentation: "drawer"`.
 *
 * Replaces WindowPanel's usual fullscreen mobile branch with a bottom-sheet
 * drawer (vaul) that:
 *  - Opens to ~80% viewport height, user-draggable to resize.
 *  - Hides drag/resize handles entirely (vaul owns interaction).
 *  - Renders the sidebar content inside a nested drawer when present so
 *    there's no 50/50 squeeze on narrow screens.
 *  - Preserves the footer zone at the bottom of the drawer.
 *
 * Called only when `useIsMobile()` is true; on desktop the normal
 * WindowPanel shell renders instead.
 */
import { useState, type ReactNode } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SidebarIcon, X } from "lucide-react";

interface MobileDrawerSurfaceProps {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  sidebar?: ReactNode;
  footer?: ReactNode;
  /** Open state — mirrors the parent's overlay-isOpen flag. */
  isOpen: boolean;
  actionsLeft?: ReactNode;
  actionsRight?: ReactNode;
  /** Optional className applied to the body scroll container. */
  bodyClassName?: string;
  /** Marks the root `data-surface-layer` (see WindowPanel `surfaceLayer`). */
  surfaceLayer?: string;
  /**
   * Size the sheet to its content (capped at 85dvh) instead of a fixed 85dvh:
   * a short form no longer sits on a band of empty sheet.
   */
  sizeToContent?: boolean;
  /**
   * Whether the sidebar should collapse into a nested drawer when the user
   * taps the sidebar toggle. When "inline", the sidebar pushes the body
   * instead. Default: "drawer".
   */
  sidebarAs?: "drawer" | "inline";
}

export default function MobileDrawerSurface({
  title,
  children,
  onClose,
  sidebar,
  footer,
  isOpen,
  actionsLeft,
  actionsRight,
  bodyClassName,
  surfaceLayer,
  sizeToContent = false,
  sidebarAs = "drawer",
}: MobileDrawerSurfaceProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hasSidebar = !!sidebar;

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        data-surface-layer={surfaceLayer}
        className={cn(
          "max-h-[85dvh] px-0 pb-safe flex flex-col",
          sizeToContent ? "h-auto" : "h-[85dvh]",
        )}
      >
        {/* Accessible title — rendered visually as our header */}
        {/* The handle row above is a 44px drag area with the bar at its
            centre; the header tucks into its lower half (no second padded
            band — the title sat 40px under the handle). */}
        <div className="-mt-3 flex items-center gap-1 px-3 py-0 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-1 shrink-0">{actionsLeft}</div>
          <DrawerTitle className="flex-1 text-sm font-medium truncate mx-2">
            {title}
          </DrawerTitle>
          <div className="flex items-center gap-1 shrink-0">
            {actionsRight}
            {hasSidebar && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <SidebarIcon className="w-4 h-4" />
              </Button>
            )}
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </DrawerClose>
          </div>
        </div>

        {/* Screen-reader description; invisible visually */}
        <DrawerDescription className="sr-only">
          {typeof title === "string" ? title : "Mobile window"}
        </DrawerDescription>

        {/* Body + optional inline sidebar. If sidebarAs === "drawer", the
            sidebar opens in a nested Drawer instead. */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {hasSidebar && sidebarAs === "inline" && sidebarOpen && (
            <div className="w-2/5 min-w-[160px] border-r border-border/50 overflow-y-auto">
              {sidebar}
            </div>
          )}
          <div
            className={cn(
              "flex-1 min-h-0 overflow-auto",
              bodyClassName,
            )}
          >
            {children}
          </div>
        </div>

        {footer && (
          <div className="border-t border-border/50 shrink-0">{footer}</div>
        )}
      </DrawerContent>

      {/* Nested sidebar drawer (sidebarAs === "drawer") */}
      {hasSidebar && sidebarAs === "drawer" && (
        <Drawer
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          direction="right"
        >
          <DrawerContent className="h-[85dvh] max-h-[85dvh] w-[85vw] max-w-[420px] ml-auto flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
              <DrawerTitle className="flex-1 text-sm font-medium">
                Menu
              </DrawerTitle>
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Close sidebar"
                >
                  <X className="w-4 h-4" />
                </Button>
              </DrawerClose>
            </div>
            <DrawerDescription className="sr-only">
              Sidebar menu
            </DrawerDescription>
            <div className="flex-1 min-h-0 overflow-auto">{sidebar}</div>
          </DrawerContent>
        </Drawer>
      )}
    </Drawer>
  );
}
