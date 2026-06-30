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
// It measures the BOUNDED center cell from RouteHeader (`1fr min-w-0`) via a
// ResizeObserver and picks the densest variant that fits, so it can never spill
// into the left/right regions.
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
      const avail = cell.clientWidth;
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
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          navigate(item.href);
        }}
        title={item.name}
        aria-label={item.name}
        className={cn(
          ITEM,
          isActive
            ? "bg-[var(--matrx-glass-bg-active)] text-[var(--shell-nav-text-hover)]"
            : "text-[var(--shell-nav-text)] hover:text-[var(--shell-nav-text-hover)]",
        )}
      >
        {Icon && <Icon />}
        {showLabel && <span>{item.name}</span>}
      </Link>
    );
  };

  const ActiveIcon = current?.icon;

  return (
    <div ref={cellRef} className="relative flex min-w-0 justify-center">
      {/* Hidden measurers — always at natural width, never affect layout. */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0"
      >
        <div ref={fullRef} className={PILL}>
          {items.map((i) => renderItem(i, true))}
        </div>
        {canIcons && (
          <div ref={iconsRef} className={PILL}>
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
              <span
                className={cn(
                  ITEM,
                  "bg-[var(--matrx-glass-bg-active)] text-[var(--shell-nav-text-hover)]",
                )}
              >
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
                  onSelect={() => navigate(item.href)}
                  className={cn("gap-2", isActive && "font-semibold")}
                >
                  {Icon && <Icon className="w-4 h-4 shrink-0" />}
                  {item.name}
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
