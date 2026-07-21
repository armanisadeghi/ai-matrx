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
//   icons → icon-only pill            (text wouldn't fit; requires every item
//                                       to have an icon, else this stage is
//                                       skipped)
//   menu  → single dropdown trigger   (not even icons fit)
//
// It measures the BOUNDED center slot from RouteHeader (viewport-centered,
// width = total − 2×max(left, right)) via a ResizeObserver and picks the
// densest variant that fits, so it can never spill into the left/right regions.
//
// cmd/ctrl+click on any item opens that sub-route in a new tab (Link + href),
// per the repo navigation-feedback rule.

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
  NAV_ITEM_SELECTED,
  NAV_ITEM_UNSELECTED,
} from "@/features/shell/components/header/navItemClasses";

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

  const cellRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const iconsRef = useRef<HTMLDivElement>(null);

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

    const compute = () => {
      const avail = cell.clientWidth - FLANK_GUTTER;
      const fullW = fullRef.current?.scrollWidth ?? 0;
      const iconsW = iconsRef.current?.scrollWidth ?? 0;
      if (fullW <= avail) setVariant("full");
      else if (canIcons && iconsW > 0 && iconsW <= avail) setVariant("icons");
      else setVariant("menu");
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(cell);
    return () => ro.disconnect();
  }, [items, canIcons]);

  const renderItem = (item: RouteNavItem, showLabel: boolean) => {
    const Icon = item.icon;
    const isActive = item.href === current?.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={(e) => {
          if (allowNativeNewTab(e)) return;
          e.preventDefault();
          navigate(item.href);
        }}
        title={item.name}
        aria-label={item.name}
        aria-current={isActive ? "page" : undefined}
        className={cn(ITEM, isActive ? NAV_ITEM_SELECTED : NAV_ITEM_UNSELECTED)}
      >
        {Icon && <Icon />}
        {showLabel && <span>{item.name}</span>}
      </Link>
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
          stretch to the widest sibling and the icons measurer reports the
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
          <div ref={iconsRef} className={cn(PILL, "w-max")}>
            {items.map((i) => renderItem(i, false))}
          </div>
        )}
      </div>

      {/* Visible variant */}
      {variant === "menu" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(PILL, "px-1")}
              aria-label="Switch view"
            >
              <span className={cn(ITEM, NAV_ITEM_SELECTED)}>
                {ActiveIcon && <ActiveIcon />}
                {/* Phones: icon-only trigger — the label would overflow the
                    tiny center cell into the shell's right icons. */}
                <span className={cn(ActiveIcon && "hidden sm:inline")}>
                  {current?.name ?? "Menu"}
                </span>
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
                      "font-semibold bg-accent text-accent-foreground focus:bg-accent",
                  )}
                >
                  <Link
                    href={item.href}
                    onClick={(e) => {
                      if (allowNativeNewTab(e)) return;
                      e.preventDefault();
                      navigate(item.href);
                    }}
                  >
                    {Icon && <Icon className="w-4 h-4 shrink-0" />}
                    {item.name}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className={PILL}>
          {items.map((i) => renderItem(i, variant === "full"))}
        </div>
      )}
    </div>
  );
}
