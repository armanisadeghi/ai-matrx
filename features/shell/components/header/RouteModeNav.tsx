"use client";

// RouteModeNav — the canonical, fully-responsive sub-route navigation.
//
// Pass a list of { name, href, icon? } and it renders a centered pill that
// switches between the route's sub-views. It is the ONE canonical control for
// that choice — never pair it with a second selector (e.g. a dropdown in the
// header's left slot) for the same routes.
//
// Responsive collapse (measurement-driven, like the agent header — NOT fixed
// breakpoints, so it adapts to the real leftover width AND the item count):
//
//   full  → icon + text pill          (everything fits)
//   icons → icon-focused pill         (inactive items are icon-only; the
//                                       active item keeps icon + text; requires
//                                       every item to have an icon, else this
//                                       stage is skipped)
//   menu  → single dropdown trigger   (not even icons fit)
//
// It measures the BOUNDED center slot from RouteHeader (viewport-centered,
// width = total − 2×max(left, right)) via a ResizeObserver and picks the
// densest variant that fits, so it can never spill into the left/right regions.
//
// cmd/ctrl+click on any item opens that sub-route in a new tab (Link + href),
// per the repo navigation-feedback rule.
//
// Icon-only items name themselves via NavItemTooltip (fast styled tooltip
// below the pill, instant when scanning across siblings) — never a native
// `title=`, and never a hover-expanding inline label (labels differ in width,
// so inline expansion always shifts the pill).

import { useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { allowNativeNewTab } from "@/utils/navigation/should-open-in-new-tab";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@/components/official/bottom-sheet/BottomSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  NAV_ITEM_SELECTED,
  NAV_ITEM_UNSELECTED,
} from "@/features/shell/components/header/navItemClasses";
import {
  NavItemTooltip,
  NavTooltipProvider,
} from "@/features/shell/components/header/NavItemTooltip";
import { centerSlotWidth } from "@/features/shell/components/header/RouteHeader";

export interface RouteNavItem {
  name: string;
  href: string;
  icon?: LucideIcon;
}

type Variant = "full" | "icons" | "menu";

interface RouteModeNavProps {
  items: RouteNavItem[];
  /** Optional explicit active href. Defaults to matching the current pathname. */
  activeHref?: string;
}

function resolveActive(
  items: RouteNavItem[],
  pathname: string,
): RouteNavItem | undefined {
  const exact = items.find((i) => i.href === pathname);
  if (exact) return exact;
  // Longest prefix match handles nested routes (e.g. /x/y under /x).
  return items
    .filter((i) => pathname.startsWith(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

const PILL =
  "matrx-glass-thin-border flex items-center gap-0 rounded-full p-0.5 whitespace-nowrap";
const ITEM =
  "flex items-center justify-center gap-1 py-0.5 px-2.5 text-[0.6875rem] font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap [&_svg]:w-3.5 [&_svg]:h-3.5";

// Breathing room the nav must keep between itself and the header's left/right
// flanks. Without it the measurement picks "full" whenever the content fits by
// even 1px, so the pill ends up flush against the shell's own icons (observed
// on /marketing at ~700px: 365px of content into a 368px slot).
const FLANK_GUTTER = 32;

export function RouteModeNav({ items, activeHref }: RouteModeNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [variant, setVariant] = useState<Variant>("full");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  const cellRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);

  const canIcons = items.every((i) => i.icon);
  const current = activeHref
    ? items.find((i) => i.href === activeHref)
    : resolveActive(items, pathname);

  const navigate = (href: string) => {
    if (href === current?.href) return;
    router.push(href);
  };

  useLayoutEffect(() => {
    const cell = cellRef.current;
    if (!cell) return;
    const routeHeader = cell.closest<HTMLElement>("[data-route-header-root]");
    const routeHeaderLeft = routeHeader?.querySelector<HTMLElement>(
      "[data-route-header-left]",
    );
    const routeHeaderRight = routeHeader?.querySelector<HTMLElement>(
      "[data-route-header-right]",
    );

    const compute = () => {
      // RouteHeader normally writes this bound onto the absolute center. Read
      // the same geometry here as well so portal-mount timing can never make
      // the nav mistake its own compact intrinsic width for all available
      // space (or treat the full header width as safe around unequal flanks).
      const boundedWidth = routeHeader
        ? centerSlotWidth(
            routeHeader.clientWidth,
            routeHeaderLeft?.offsetWidth ?? 0,
            routeHeaderRight?.offsetWidth ?? 0,
          )
        : cell.clientWidth;
      const avail = Math.min(cell.clientWidth, boundedWidth) - FLANK_GUTTER;
      const fullW = fullRef.current?.scrollWidth ?? 0;
      const compactW = compactRef.current?.scrollWidth ?? 0;
      if (fullW <= avail) setVariant("full");
      else if (canIcons && compactW > 0 && compactW <= avail)
        setVariant("icons");
      else setVariant("menu");
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(cell);
    if (fullRef.current) ro.observe(fullRef.current);
    if (compactRef.current) ro.observe(compactRef.current);
    if (routeHeader) ro.observe(routeHeader);
    if (routeHeaderLeft) ro.observe(routeHeaderLeft);
    if (routeHeaderRight) ro.observe(routeHeaderRight);
    return () => ro.disconnect();
  }, [items, canIcons, current?.href]);

  // `withTooltip` is true only in the VISIBLE pill — the hidden measurers
  // render plain items so Radix triggers never join the measurement DOM.
  const renderItem = (
    item: RouteNavItem,
    showLabel: boolean,
    withTooltip = false,
  ) => {
    const Icon = item.icon;
    const isActive = item.href === current?.href;
    const link = (
      <Link
        key={item.href}
        href={item.href}
        onClick={(e) => {
          if (allowNativeNewTab(e)) return;
          e.preventDefault();
          navigate(item.href);
        }}
        aria-label={item.name}
        aria-current={isActive ? "page" : undefined}
        className={cn(ITEM, isActive ? NAV_ITEM_SELECTED : NAV_ITEM_UNSELECTED)}
      >
        {Icon && <Icon />}
        {showLabel && <span>{item.name}</span>}
      </Link>
    );
    if (!withTooltip || showLabel) return link;
    return (
      <NavItemTooltip key={item.href} label={item.name}>
        {link}
      </NavItemTooltip>
    );
  };

  const ActiveIcon = current?.icon;

  return (
    // w-full is load-bearing: the measured width must be the CELL's available
    // space, not the currently-rendered variant's content width — otherwise a
    // compact first render (portal not yet laid out) locks the nav in "menu".
    <div ref={cellRef} className="relative flex w-full min-w-0 justify-center">
      {/* Hidden measurers — always at natural width, never affect layout.
          `w-max` on EACH measurer is load-bearing: they are block-level
          siblings inside one shrink-to-fit absolute box, so without it both
          stretch to the widest sibling and the compact measurer reports the
          FULL width. That made `iconsW <= avail` unreachable whenever
          `fullW > avail`, so the "icons" stage was dead code and every nav
          jumped full → menu. (Fixed 2026-07-20; do not regress.) */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0"
      >
        <div ref={fullRef} className={cn(PILL, "w-max")}>
          {items.map((i) => renderItem(i, true))}
        </div>
        {canIcons && (
          <div ref={compactRef} className={cn(PILL, "w-max")}>
            {items.map((i) => renderItem(i, i.href === current?.href))}
          </div>
        )}
      </div>

      {/* Visible variant */}
      {variant === "menu" ? (
        isMobile ? (
          <>
            <button
              type="button"
              className={cn(PILL, "px-1")}
              aria-label="Switch view"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className={cn(ITEM, NAV_ITEM_SELECTED)}>
                {ActiveIcon && <ActiveIcon />}
                <span className={cn(ActiveIcon && "hidden sm:inline")}>
                  {current?.name ?? "Menu"}
                </span>
                <ChevronDown className="opacity-60" />
              </span>
            </button>
            <BottomSheet
              open={mobileMenuOpen}
              onOpenChange={setMobileMenuOpen}
              title="Switch view"
            >
              <BottomSheetHeader
                title="Switch view"
                trailing={
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
                  >
                    Done
                  </button>
                }
              />
              <BottomSheetBody>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === current?.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={(event) => {
                        setMobileMenuOpen(false);
                        if (allowNativeNewTab(event)) return;
                        event.preventDefault();
                        navigate(item.href);
                      }}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex min-h-[52px] w-full items-center border-b border-white/[0.06] px-5 text-[15px] transition-colors active:bg-white/5",
                        isActive && "font-medium text-primary",
                      )}
                    >
                      {Icon && <Icon className="mr-3 h-4 w-4 shrink-0" />}
                      <span className="flex-1 text-left">{item.name}</span>
                    </Link>
                  );
                })}
              </BottomSheetBody>
            </BottomSheet>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(PILL, "px-1")}
                aria-label="Switch view"
              >
                <span className={cn(ITEM, NAV_ITEM_SELECTED)}>
                  {ActiveIcon && <ActiveIcon />}
                  <span>{current?.name ?? "Menu"}</span>
                  <ChevronDown className="opacity-60" />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === current?.href;
                return (
                  <DropdownMenuItem
                    key={item.href}
                    asChild
                    className={cn(
                      "gap-2",
                      isActive &&
                        "bg-accent font-semibold text-accent-foreground focus:bg-accent",
                    )}
                  >
                    <Link
                      href={item.href}
                      onClick={(event) => {
                        if (allowNativeNewTab(event)) return;
                        event.preventDefault();
                        navigate(item.href);
                      }}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      {item.name}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      ) : (
        <NavTooltipProvider>
          <div className={PILL} data-route-nav-variant={variant}>
            {items.map((item) =>
              renderItem(
                item,
                variant === "full" || item.href === current?.href,
                true,
              ),
            )}
          </div>
        </NavTooltipProvider>
      )}
    </div>
  );
}
