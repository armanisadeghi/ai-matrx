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
//           · in flow                 (the trigger does not fit the centered
//                                       slot: it leaves the true center and
//                                       takes RouteHeader's whole center cell,
//                                       beside the title — `data-route-nav-inflow`)
//           · icon only               (not even the labelled trigger fits: the
//                                       current mode's icon + chevron, the name
//                                       kept for assistive tech)
//   none  → nothing drawn             (not even the icon trigger fits beside
//                                       the title at its floor — RouteHeader
//                                       truncates a title down to that floor
//                                       to make room first; below it the
//                                       TITLE wins. Page-pass 2026-09-27: the
//                                       trigger used to draw anyway, clipped —
//                                       "nu" after a phone title, a "Menu"
//                                       stub on top of "Flashcard St…")
//
// It measures the BOUNDED center slot from RouteHeader (viewport-centered,
// width = total − 2×max(left, right)) via a ResizeObserver and picks the
// densest variant that fits, so it can never spill into the left/right regions.
// Before "none" it tries RouteHeader's in-flow center cell — at 768px the
// applet header's centered slot was 0px wide and its whole mode nav
// vanished (2026-09-27). RouteHeader reserves room in that cell for the icon
// trigger by reading `data-route-nav-min`.
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
import AppLink from "@/components/navigation/AppLink";
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
} from "@ai-matrx/design-system";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import {
  NAV_ITEM_SELECTED,
  NAV_ITEM_UNSELECTED,
} from "@/features/shell/components/header/navItemClasses";
import {
  NavItemTooltip,
  NavTooltipProvider,
} from "@/features/shell/components/header/NavItemTooltip";
import {
  CENTER_INFLOW_GUTTER,
  centerSlotWidth,
} from "@/features/shell/components/header/RouteHeader";
import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";

export interface RouteNavItem {
  name: string;
  href: string;
  icon?: LucideIcon;
  /** Match only this pathname; use for Overview/root modes. */
  exact?: boolean;
  /**
   * One line saying what a person DOES on that sub-route. Supply it whenever
   * the label alone is a name the reader has to already know ("Workbench",
   * "Rulebook", "Scribe"): it becomes a tooltip under the label — including in
   * the FULL variant, where the label is visible but not self-explanatory —
   * and the subtitle in the dropdown and the mobile sheet. Ruled 2026-08-24
   * (Arman, on the keyword surfaces: "I need to know where to go").
   */
  description?: string;
}

type Variant = "full" | "icons" | "menu" | "none";

interface NavLayout {
  variant: Variant;
  /** Out of the centered slot, in RouteHeader's whole center cell. */
  inflow: boolean;
  /** The menu trigger shows the current mode's icon only. */
  iconTrigger: boolean;
}

interface RouteModeNavProps {
  items: RouteNavItem[];
  /** Optional explicit active href. Defaults to matching the current pathname. */
  activeHref?: string;
  /**
   * Take the navigation instead of `router.push` — for modes that are
   * client-side views of one page (a `?mode=` shallow URL update, no server
   * round-trip).
   */
  onNavigate?: (href: string) => void;
  /**
   * The densest variant allowed. `"menu"` keeps the nav as ONE labeled dropdown
   * trigger at every width — for a page whose own labeled tab bar is the primary
   * nav, so the header never becomes a second row of unlabeled icons.
   */
  maxVariant?: "full" | "menu";
  /**
   * What the collapsed trigger says when the current page is none of the
   * items (a tool page inside the section) — the section's name, never the
   * generic "Menu". Default "Menu".
   */
  fallbackLabel?: string;
}

// A solid track, never glass: the header band is solid, so nothing moves
// behind it ("glass only floats" — owner, 2026-10-03).
const PILL =
  "bg-muted flex items-center gap-0 rounded-full p-0.5 whitespace-nowrap";
// Route navigation lives inside the shell's compact fixed-height header. The
// collapsed mobile trigger alone is a true tap control, so it reserves a 44px
// hit target without changing the compact desktop pill geometry. Its sheet
// owns the large route rows after activation.
const ITEM =
  "matrx-glyph-trim [--matrx-glyph-size:0.875rem] flex items-center justify-center gap-1 py-0.5 px-2.5 text-xs font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap [&_svg]:w-3.5 [&_svg]:h-3.5";

// Breathing room the nav must keep between itself and the header's left/right
// flanks. Without it the measurement picks "full" whenever the content fits by
// even 1px, so the pill ends up flush against the shell's own icons (observed
// on /marketing at ~700px: 365px of content into a 368px slot).
const FLANK_GUTTER = 32;

export function RouteModeNav({
  items,
  activeHref,
  maxVariant = "full",
  onNavigate,
  fallbackLabel = "Menu",
}: RouteModeNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [layout, setLayout] = useState<NavLayout>({
    variant: maxVariant === "menu" ? "menu" : "full",
    inflow: false,
    iconTrigger: false,
  });
  const { variant, inflow, iconTrigger } = layout;
  // Until the first measurement the visible variant is the server's guess ("full"), which can
  // overlap the title and then snap to icons once hydrated. It holds its place unseen until then:
  // the first look is the measured one (SSR ZERO LAYOUT SHIFT — no labelled-then-icons flip).
  const [measured, setMeasured] = useState(false);
  const revealQueued = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  const cellRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuIconRef = useRef<HTMLSpanElement>(null);

  const canIcons = items.every((i) => i.icon);
  const itemsKey = items.map((i) => i.href).join("|");
  const current = activeHref
    ? items.find((i) => i.href === activeHref)
    : resolveActiveRouteMode(items, pathname);

  const navigate = (href: string) => {
    if (href === current?.href) return;
    if (onNavigate) onNavigate(href);
    else router.push(href);
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
    const routeHeaderCenter = cell.closest<HTMLElement>(
      "[data-route-header-center]",
    );

    const compute = () => {
      // RouteHeader insets its center cell to this bound. Read the same
      // geometry here as well so portal-mount timing can never make
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
      const menuW = menuRef.current?.scrollWidth ?? 0;
      const menuIconW = menuIconRef.current?.scrollWidth ?? menuW;
      // The whole center cell — its track, not the centered inset inside it
      // that the in-flow layout drops — so the choice never depends on itself.
      // +1: clientWidth rounds, a fit-content track need not — the reserve
      // RouteHeader made for the icon trigger must never read 1px short.
      const inflowAvail = routeHeaderCenter
        ? routeHeaderCenter.clientWidth - CENTER_INFLOW_GUTTER + 1
        : -Infinity;
      const centered = (w: number) => w <= avail + FLANK_GUTTER / 2;
      let next: NavLayout;
      if (maxVariant !== "menu" && fullW <= avail)
        next = { variant: "full", inflow: false, iconTrigger: false };
      else if (
        maxVariant !== "menu" &&
        canIcons &&
        compactW > 0 &&
        compactW <= avail
      )
        next = { variant: "icons", inflow: false, iconTrigger: false };
      else if (centered(menuW))
        next = { variant: "menu", inflow: false, iconTrigger: false };
      else if (menuW <= inflowAvail)
        next = { variant: "menu", inflow: true, iconTrigger: false };
      else if (centered(menuIconW))
        next = { variant: "menu", inflow: false, iconTrigger: true };
      else if (menuIconW <= inflowAvail)
        next = { variant: "menu", inflow: true, iconTrigger: true };
      // Below the title's floor the title wins: a trigger that does not fit
      // is not drawn at all — a clipped one reads as garbage beside the title.
      else next = { variant: "none", inflow: false, iconTrigger: false };
      // THE FIRST MEASUREMENT IS NOT THE FINAL ONE: RouteHeader writes its flank geometry after this
      // effect first runs, so a pill revealed on the first answer showed "full" (341px) for a frame
      // and then collapsed to icons (208px) when the follow-up measurement landed (/meetings at
      // 1440px). The reveal waits two frames; the observers above settle the variant meanwhile.
      if (!revealQueued.current) {
        revealQueued.current = true;
        requestAnimationFrame(() => requestAnimationFrame(() => setMeasured(true)));
      }
      setLayout((prev) =>
        prev.variant === next.variant &&
        prev.inflow === next.inflow &&
        prev.iconTrigger === next.iconTrigger
          ? prev
          : next,
      );
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(cell);
    if (fullRef.current) ro.observe(fullRef.current);
    if (compactRef.current) ro.observe(compactRef.current);
    if (menuRef.current) ro.observe(menuRef.current);
    if (menuIconRef.current) ro.observe(menuIconRef.current);
    if (routeHeader) ro.observe(routeHeader);
    if (routeHeaderLeft) ro.observe(routeHeaderLeft);
    if (routeHeaderRight) ro.observe(routeHeaderRight);
    if (routeHeaderCenter) ro.observe(routeHeaderCenter);
    // RouteHeader writes its geometry (the title cap, the centering inset) as
    // inline styles AFTER this effect first runs. ResizeObservers deliver only
    // when a frame renders — never in a hidden tab — so the nav also follows
    // those writes directly; otherwise its first guess stands until a frame.
    const mo = new MutationObserver(compute);
    if (routeHeader)
      mo.observe(routeHeader, { attributes: true, attributeFilter: ["style"] });
    const inset = cell.closest<HTMLElement>("[data-route-header-inset]");
    if (inset)
      mo.observe(inset, { attributes: true, attributeFilter: ["style"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // Keyed on WHAT the items are, not on the array's identity. Callers build
    // this list inline, so a parent that re-renders often — a live agent run, a
    // marketing site receiving crawl heartbeats — handed a fresh array every
    // time and tore down and rebuilt six ResizeObserver targets on each one.
    // The measurement only depends on the hrefs present and whether they all
    // have icons.
  }, [itemsKey, canIcons, current?.href, maxVariant]);

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
      <AppLink
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
      </AppLink>
    );
    // A visible label still earns a tooltip when the item carries a purpose —
    // the label is the NAME, the description is what you do there.
    if (!withTooltip || (showLabel && !item.description)) return link;
    return (
      <NavItemTooltip
        key={item.href}
        label={item.name}
        description={item.description}
      >
        {link}
      </NavItemTooltip>
    );
  };

  const ActiveIcon = current?.icon;

  return (
    // w-full is load-bearing: the measured width must be the CELL's available
    // space, not the currently-rendered variant's content width — otherwise a
    // compact first render (portal not yet laid out) locks the nav in "menu".
    <div
      ref={cellRef}
      className={cn(
        "relative flex w-full min-w-0 justify-center",
        !measured && "[&>*:not(:first-child)]:invisible",
      )}
      data-route-nav-inflow={inflow ? "" : undefined}
    >
      {/* Hidden measurers — always at natural width, never affect layout.
          `w-max` on EACH measurer is load-bearing: they are block-level
          siblings inside one shrink-to-fit absolute box, so without it both
          stretch to the widest sibling and the compact measurer reports the
          FULL width. That made `iconsW <= avail` unreachable whenever
          `fullW > avail`, so the "icons" stage was dead code and every nav
          jumped full → menu. (Fixed 2026-07-20; do not regress.)
          `max-w-none` is load-bearing too: the global base rule
          `* { max-width: 100% }` capped each measurer at the nav's own box,
          so a narrow nav measured its FULL pill at 143px instead of 408px
          and believed it fit (2026-09-27). */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0"
      >
        <div ref={fullRef} className={cn(PILL, "w-max max-w-none")}>
          {items.map((i) => renderItem(i, true))}
        </div>
        {canIcons && (
          <div ref={compactRef} className={cn(PILL, "w-max max-w-none")}>
            {items.map((i) => renderItem(i, i.href === current?.href))}
          </div>
        )}
        {/* The collapsed trigger, as the visible menu variant draws it. */}
        <span ref={menuRef} className={cn(PILL, "w-max max-w-none px-1")}>
          <span className={cn(ITEM, NAV_ITEM_SELECTED)}>
            {ActiveIcon && <ActiveIcon />}
            {!(isMobile && ActiveIcon) && (
              <span>{current?.name ?? fallbackLabel}</span>
            )}
            <ChevronDown className="opacity-60" />
          </span>
        </span>
        {/* The smallest trigger: the icon alone. RouteHeader reserves room for
            it beside the title (`data-route-nav-min`). */}
        <span
          ref={menuIconRef}
          data-route-nav-min
          className={cn(PILL, "w-max max-w-none px-1")}
        >
          <span className={cn(ITEM, NAV_ITEM_SELECTED)}>
            {ActiveIcon ? (
              <ActiveIcon />
            ) : (
              <span>{current?.name ?? fallbackLabel}</span>
            )}
            <ChevronDown className="opacity-60" />
          </span>
        </span>
      </div>

      {/* Visible variant */}
      {variant === "none" ? null : variant === "menu" ? (
        <>
          {/* Both triggers render; CSS picks (SSR ZERO LAYOUT SHIFT): the phone
              pill opens a bottom sheet, the desktop capsule a dropdown. */}
          <span className="contents md:hidden">
            <button
              type="button"
              className={cn(PILL, "min-h-11 px-1")}
              aria-label="Switch view"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className={cn(ITEM, NAV_ITEM_SELECTED)}>
                {ActiveIcon && <ActiveIcon />}
                <span
                  className={cn(
                    ActiveIcon &&
                      (iconTrigger ? "sr-only" : "hidden sm:inline"),
                  )}
                >
                  {current?.name ?? fallbackLabel}
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
                    <AppLink
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
                        "flex min-h-[52px] w-full items-center border-b border-glass-edge px-5 text-[15px] transition-colors active:bg-glass-active",
                        isActive && "font-medium text-primary",
                      )}
                    >
                      {Icon && <Icon className="mr-3 h-4 w-4 shrink-0" />}
                      <span className="flex-1 text-left">
                        {item.name}
                        {item.description ? (
                          <span className="mt-0.5 block type-body font-normal leading-snug text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </AppLink>
                  );
                })}
              </BottomSheetBody>
            </BottomSheet>
          </span>
          <span className="hidden md:contents">
            <DropdownMenu>
              {/* The track is decoration; the BUTTON is the selected capsule
                itself, so the pressable box hugs its label. A button that is
                the whole track reads as a pill stretched by the track's inset
                (pill-guard, Rulebook/Industry packs/Setup headers,
                2026-10-05). */}
              <span className={cn(PILL, "px-1")}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(ITEM, NAV_ITEM_SELECTED)}
                    aria-label="Switch view"
                  >
                    {ActiveIcon && <ActiveIcon />}
                    <span
                      className={cn(iconTrigger && ActiveIcon && "sr-only")}
                    >
                      {current?.name ?? fallbackLabel}
                    </span>
                    <ChevronDown className="opacity-60" />
                  </button>
                </DropdownMenuTrigger>
              </span>
              <DropdownMenuContent
                align="center"
                className={cn(
                  items.some((i) => i.description) ? "w-72" : "w-52",
                )}
              >
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
                      <AppLink
                        href={item.href}
                        onClick={(event) => {
                          if (allowNativeNewTab(event)) return;
                          event.preventDefault();
                          navigate(item.href);
                        }}
                        className={cn(item.description && "items-start py-1.5")}
                      >
                        {Icon && (
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              item.description && "mt-0.5",
                            )}
                          />
                        )}
                        {item.description ? (
                          <span className="min-w-0 flex-1">
                            <span className="block">{item.name}</span>
                            <span className="mt-0.5 block whitespace-normal type-secondary font-normal leading-snug text-muted-foreground">
                              {item.description}
                            </span>
                          </span>
                        ) : (
                          item.name
                        )}
                      </AppLink>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </>
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
