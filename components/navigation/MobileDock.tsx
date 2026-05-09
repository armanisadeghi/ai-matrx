"use client";

/**
 * MobileDock — a reusable floating bottom navigation dock.
 *
 * Rules:
 *  - Up to 5 items   → show all, no overflow button
 *  - 6+ items        → show first 4 + "…" button (5 total tap targets)
 *  - "…" opens a Drawer listing ALL items (complete nav sheet)
 *  - Active item shows an animated sliding pill that fills the slot
 *  - Labels hide automatically when the dock is too narrow to show them cleanly
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DockItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  exactMatch?: boolean;
  badge?: string | number;
  comingSoon?: boolean;
}

interface MobileDockProps {
  items: DockItem[];
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 5;
const OVERFLOW_THRESHOLD = MAX_VISIBLE + 1;

// Inset from each slot edge — pill fills slot minus this on each side
const PILL_INSET_X = 3;  // px inset on left and right within the slot
const PILL_INSET_Y = 4;  // px inset on top and bottom within the dock

// Minimum per-item pixel width below which we hide labels
const LABEL_MIN_WIDTH = 56;

// ─── Pill geometry state ──────────────────────────────────────────────────────

interface PillGeometry {
  x: number; // left edge of pill, relative to nav container
  width: number; // pill width
  height: number; // pill height (dock height - 2*PILL_INSET_Y)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MobileDock({ items, className }: MobileDockProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pill, setPill] = useState<PillGeometry | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // ─── Visible / overflow split ──────────────────────────────────────────────
  const hasOverflow = items.length >= OVERFLOW_THRESHOLD;
  const visibleItems = hasOverflow
    ? items.slice(0, MAX_VISIBLE - 1)
    : items.slice(0, MAX_VISIBLE);

  // ─── Active index ──────────────────────────────────────────────────────────
  const activeIndex = visibleItems.findIndex((item) =>
    item.exactMatch ? pathname === item.href : pathname.startsWith(item.href),
  );

  // ─── Pill geometry — tracks full slot width + dock height ─────────────────
  const measurePill = useCallback(() => {
    const nav = navRef.current;
    const activeEl = itemRefs.current[activeIndex];
    if (!nav || !activeEl || activeIndex < 0) {
      setPill(null);
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();

    const dockH = navRect.height;
    const navW = navRect.width;
    const CORNER_RADIUS = 22; // matches rounded-[22px] on the dock

    // Raw slot position relative to nav
    const rawX = itemRect.left - navRect.left + PILL_INSET_X;
    const rawW = itemRect.width - PILL_INSET_X * 2;

    // Clamp pill so it never bleeds outside the dock's rounded corners
    const minX = CORNER_RADIUS / 2;
    const maxRight = navW - CORNER_RADIUS / 2;
    const clampedX = Math.max(minX, rawX);
    const clampedRight = Math.min(maxRight, rawX + rawW);
    const clampedW = Math.max(0, clampedRight - clampedX);

    setPill({
      x: clampedX,
      width: clampedW,
      height: dockH - PILL_INSET_Y * 2,
    });
  }, [activeIndex]);

  useEffect(() => {
    measurePill();
  }, [measurePill, pathname]);

  // ─── Label visibility (ResizeObserver) ────────────────────────────────────
  const measureLabels = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const totalItems = visibleItems.length + (hasOverflow ? 1 : 0);
    const perItemWidth = nav.offsetWidth / Math.max(totalItems, 1);
    setShowLabels(perItemWidth >= LABEL_MIN_WIDTH);
    // re-measure pill geometry when size changes
    measurePill();
  }, [visibleItems.length, hasOverflow, measurePill]);

  useEffect(() => {
    measureLabels();
    if (!navRef.current) return;
    const ro = new ResizeObserver(measureLabels);
    ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [measureLabels]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe px-3 pointer-events-none",
          className,
        )}
      >
        <div
          ref={navRef}
          className="relative flex items-stretch matrx-glass-card rounded-[22px] shadow-lg border border-white/[0.08] mb-2 pointer-events-auto"
        >
          {/* Sliding pill indicator — fills the active slot */}
          {pill && (
            <div
              aria-hidden
              className="absolute rounded-full bg-primary/10 dark:bg-primary/15 border border-primary/20 dark:border-primary/30"
              style={{
                top: PILL_INSET_Y,
                left: pill.x,
                width: pill.width,
                height: pill.height,
                transition:
                  "left 380ms cubic-bezier(0.34, 1.56, 0.64, 1), width 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                zIndex: 1,
                pointerEvents: "none",
              }}
            />
          )}

          {/* Visible items */}
          {visibleItems.map((item, i) => {
            const Icon = item.icon;
            const isActive = i === activeIndex;

            return (
              <div
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className="relative flex-1 flex items-center justify-center min-w-0"
              >
                <Link
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    "relative z-10 flex flex-col items-center justify-center gap-1 w-full py-3 px-1 transition-colors duration-200",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="relative">
                    <Icon
                      className={cn(
                        "h-[22px] w-[22px] transition-all duration-200 shrink-0",
                        isActive &&
                          "drop-shadow-[0_0_6px_hsl(var(--primary)/0.4)]",
                      )}
                    />
                    {item.badge !== undefined && (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {showLabels && (
                    <span
                      className={cn(
                        "text-[10px] leading-none font-medium truncate max-w-full transition-colors duration-200",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}

          {/* Overflow "…" button */}
          {hasOverflow && (
            <div className="relative flex-1 flex items-center justify-center">
              <button
                onClick={() => setMoreOpen(true)}
                aria-label="More navigation options"
                title="More"
                className="relative z-10 flex flex-col items-center justify-center gap-1 w-full py-3 px-1 transition-colors duration-200 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-[22px] w-[22px]" />
                {showLabels && (
                  <span className="text-[10px] leading-none font-medium text-muted-foreground">
                    More
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Full navigation drawer — shows ALL items */}
      {hasOverflow && (
        <Drawer
          open={moreOpen}
          onOpenChange={setMoreOpen}
          shouldScaleBackground={false}
        >
          <DrawerContent className="max-h-[60dvh]">
            <DrawerTitle className="sr-only">Navigation</DrawerTitle>
            <div className="p-3 space-y-0.5 overflow-y-auto overscroll-contain pb-safe">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = item.exactMatch
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

                if (item.comingSoon) {
                  return (
                    <div
                      key={item.key}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground cursor-default opacity-50"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-normal">
                        Soon
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors min-h-[52px]",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent/50",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        isActive && "text-primary",
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Link>
                );
              })}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
