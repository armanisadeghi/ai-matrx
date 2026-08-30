"use client";

/**
 * Marketing's route menu, rendered INSIDE the app shell sidebar in place of the
 * global nav (registered in `features/shell/constants/route-menu-registry.ts`).
 *
 * The agency model gives the menu FOUR states, resolved structurally from the
 * URL (`lib/sidebar-site-context.ts`) and all driven by the same declarations
 * every other marketing map reads — so this menu cannot drift from the hub,
 * the landing, or the drift tests:
 *
 *   • AGENCY  — `MARKETING_PILLARS` (lib/marketing-nav.ts): roster, roll-ups,
 *     operations, tools. Small by design.
 *   • BRAND   — one client's workspace: `MARKETING_BRAND_SECTIONS`
 *     (lib/brand-sections.ts). Coming-soon sections stay VISIBLE with a tag —
 *     the client workspace's promised shape is part of the map (Arman,
 *     2026-08-28).
 *   • WEBSITE — one site's inventory: `MARKETING_WEBSITE_SECTIONS`, plus the
 *     door into the SEO practice on that site (the menu points at the
 *     practice; it never re-contains it).
 *   • SEO     — the practice on one site: `MARKETING_SEO_SECTIONS`, plus the
 *     door back to the site's inventory.
 *
 * `RouteMenuSlot` owns switching, collapse, the mobile presentation, and the
 * reversible Main Menu control. This component only renders registry data.
 */

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Globe, Search, TrendingUp } from "lucide-react";

import { IconResolver } from "@ai-matrx/icons";
import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import { MARKETING_PILLARS } from "@/features/marketing/lib/marketing-nav";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { resolveMarketingSidebarContext } from "@/features/marketing/lib/sidebar-site-context";
import {
  listMarketingSeoModeGroups,
  listMarketingWebsiteModeGroups,
} from "@/features/marketing/lib/route-sections";
import { listMarketingBrandModeGroups } from "@/features/marketing/lib/brand-sections";
import {
  MARKETING_SEO_SECTION_ICONS,
  MARKETING_WEBSITE_SECTION_ICONS,
} from "@/features/marketing/lib/site-section-icons";
import {
  useBrandBySegment,
  useSiteBySegment,
} from "@/features/marketing/data/keys-hooks";
import { cn } from "@/lib/utils";

interface MarketingSidebarMenuProps {
  expanded: boolean;
}

/**
 * A group heading. Collapsed, the label would be unreadable at rail width, so
 * the grouping survives as a rule instead of vanishing — the rail keeps the
 * same rhythm as the expanded menu rather than becoming one long icon run.
 */
function GroupHeading({
  label,
  expanded,
}: {
  label: string;
  expanded: boolean;
}) {
  if (!expanded) return <div className="mx-2 my-1 border-t border-border/70" />;
  return (
    <div className="px-1.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </div>
  );
}

function BackRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={ROUTE_MENU_NAV_ITEM_CLASS}
    >
      <span className="shell-nav-icon">
        <ChevronLeft
          size={ROUTE_MENU_ICON_SIZE}
          strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
        />
      </span>
      <span className="shell-nav-label truncate">{label}</span>
    </Link>
  );
}

function NavRow({
  href,
  label,
  title,
  icon,
  active,
  soon,
  activeRef,
}: {
  href: string;
  label: string;
  title?: string;
  icon: ReactNode;
  active: boolean;
  soon?: boolean;
  activeRef?: (el: HTMLAnchorElement | null) => void;
}) {
  return (
    <Link
      ref={activeRef}
      href={href}
      title={title ?? label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(ROUTE_MENU_NAV_ITEM_CLASS, active && "shell-active-pill")}
    >
      <span className="shell-nav-icon">{icon}</span>
      <span className="shell-nav-label flex min-w-0 items-center gap-1.5">
        <span className="truncate">{label}</span>
        {soon ? (
          <span className="rounded-sm bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * Scroll the active row into view once the menu is actually laid out. This
 * menu is portaled in while the sidebar may still show the main nav, so on
 * first paint it can sit inside a `display: none` subtree where scrollIntoView
 * silently does nothing — watch the container's size and scroll exactly once.
 */
function useScrollActiveIntoView(activeHref: string | undefined) {
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    const scrollToActive = () => {
      const el = activeRef.current;
      if (!el || el.clientHeight === 0) return false;
      el.scrollIntoView({ block: "nearest" });
      return true;
    };
    if (scrollToActive()) return;
    const container = document.querySelector<HTMLElement>(
      ".shell-sidebar-route-nav",
    );
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (scrollToActive()) observer.disconnect();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeHref]);
  return activeRef;
}

/** AGENCY state — the roster, roll-ups, operations, and tools. */
function AgencyMenu({
  pathname,
  expanded,
}: {
  pathname: string;
  expanded: boolean;
}) {
  return (
    <>
      <Link
        href="/marketing"
        title="Marketing Hub"
        aria-label="Marketing Hub"
        aria-current={pathname === "/marketing" ? "page" : undefined}
        className={cn(
          ROUTE_MENU_NAV_ITEM_CLASS,
          pathname === "/marketing" && "shell-active-pill",
        )}
      >
        <span className="shell-nav-icon">
          <TrendingUp
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        </span>
        <span className="shell-nav-label truncate">Marketing Hub</span>
      </Link>

      {MARKETING_PILLARS.map((pillar) => {
        const entries = pillar.entries.filter(
          (entry) => entry.status !== "coming-soon" && !entry.navHidden,
        );
        if (entries.length === 0) return null;
        return (
          <div key={pillar.key}>
            <GroupHeading label={pillar.label} expanded={expanded} />
            {entries.map((entry) => (
              <NavRow
                key={entry.href}
                href={entry.href}
                label={entry.label}
                title={entry.description}
                active={pathname.startsWith(entry.href)}
                icon={
                  <IconResolver
                    iconName={entry.iconName}
                    size={ROUTE_MENU_ICON_SIZE}
                    style={{
                      width: ROUTE_MENU_ICON_SIZE,
                      height: ROUTE_MENU_ICON_SIZE,
                      strokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
                    }}
                  />
                }
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

/** BRAND state — one client's whole workspace. */
function BrandMenu({
  brandSeg,
  pathname,
  expanded,
}: {
  brandSeg: string;
  pathname: string;
  expanded: boolean;
}) {
  // access-errors: ok — navigation enrichment only; a failed read keeps every
  // row reachable and the owning workspace surfaces its own read error.
  const brand = useBrandBySegment(brandSeg);
  const brandPath = `/marketing/${brandSeg}`;
  const groups = listMarketingBrandModeGroups(brandPath);
  const active = resolveActiveRouteMode(
    groups.flatMap((group) => group.modes),
    pathname,
  );
  const activeRef = useScrollActiveIntoView(active?.href);

  return (
    <>
      <BackRow href={marketingRoutes.brands()} label="All clients" />
      {groups.map((group) => (
        <div key={group.label}>
          {group.label === "Start" ? null : (
            <GroupHeading label={group.label} expanded={expanded} />
          )}
          {group.modes.map((mode) => {
            const isActive = active?.href === mode.href;
            const label =
              mode.slug === "" ? (brand.data?.name ?? "Overview") : mode.name;
            return (
              <NavRow
                key={mode.href}
                href={mode.href}
                label={label}
                title={mode.description}
                active={isActive}
                soon={"status" in mode && mode.status === "coming-soon"}
                activeRef={
                  isActive
                    ? (el) => {
                        activeRef.current = el;
                      }
                    : undefined
                }
                icon={
                  <IconResolver
                    iconName={mode.iconName}
                    size={ROUTE_MENU_ICON_SIZE}
                    style={{
                      width: ROUTE_MENU_ICON_SIZE,
                      height: ROUTE_MENU_ICON_SIZE,
                      strokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
                    }}
                  />
                }
              />
            );
          })}
        </div>
      ))}
    </>
  );
}

/** WEBSITE state — one site's inventory, plus the door into its SEO practice. */
function WebsiteMenu({
  brandSeg,
  siteSeg,
  pathname,
  expanded,
}: {
  brandSeg: string;
  siteSeg: string;
  pathname: string;
  expanded: boolean;
}) {
  // access-errors: ok — navigation enrichment only (labels); rows stay reachable.
  const brand = useBrandBySegment(brandSeg);
  const site = useSiteBySegment(brand.data?.id, siteSeg);
  const basePath = `/marketing/${brandSeg}/websites/${siteSeg}`;
  const groups = listMarketingWebsiteModeGroups(basePath);
  const active = resolveActiveRouteMode(
    groups.flatMap((group) => group.modes),
    pathname,
  );
  const activeRef = useScrollActiveIntoView(active?.href);
  const siteLabel = site.data?.name ?? site.data?.domain ?? siteSeg;

  return (
    <>
      <BackRow
        href={`/marketing/${brandSeg}/websites`}
        label={brand.data?.name ?? "All websites"}
      />
      {groups.map((group) => (
        <div key={group.label}>
          {group.label === "Start" ? null : (
            <GroupHeading label={group.label} expanded={expanded} />
          )}
          {group.modes.map((mode) => {
            const Icon = MARKETING_WEBSITE_SECTION_ICONS[mode.slug];
            const isActive = active?.href === mode.href;
            return (
              <NavRow
                key={mode.href}
                href={mode.href}
                label={mode.slug === "" ? siteLabel : mode.name}
                title={mode.description}
                active={isActive}
                activeRef={
                  isActive
                    ? (el) => {
                        activeRef.current = el;
                      }
                    : undefined
                }
                icon={
                  <Icon
                    size={ROUTE_MENU_ICON_SIZE}
                    strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
                  />
                }
              />
            );
          })}
        </div>
      ))}
      <GroupHeading label="Search & SEO" expanded={expanded} />
      <NavRow
        href={`/marketing/${brandSeg}/seo/${siteSeg}`}
        label="Open SEO workspace"
        title="Keywords, rankings, technical health, links, and AI visibility for this site."
        active={false}
        icon={
          <Search
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        }
      />
    </>
  );
}

/** SEO state — the practice on one site, plus the door back to its inventory. */
function SeoMenu({
  brandSeg,
  siteSeg,
  pathname,
  expanded,
}: {
  brandSeg: string;
  siteSeg: string;
  pathname: string;
  expanded: boolean;
}) {
  // access-errors: ok — navigation enrichment only (labels); rows stay reachable.
  const brand = useBrandBySegment(brandSeg);
  const site = useSiteBySegment(brand.data?.id, siteSeg);
  const basePath = `/marketing/${brandSeg}/seo/${siteSeg}`;
  const groups = listMarketingSeoModeGroups(basePath);
  const active = resolveActiveRouteMode(
    groups.flatMap((group) => group.modes),
    pathname,
  );
  const activeRef = useScrollActiveIntoView(active?.href);
  const siteLabel = site.data?.name ?? site.data?.domain ?? siteSeg;

  return (
    <>
      <BackRow href={`/marketing/${brandSeg}/seo`} label="SEO overview" />
      <Link
        href={basePath}
        title={siteLabel}
        aria-label={siteLabel}
        className={cn(ROUTE_MENU_NAV_ITEM_CLASS, "font-medium")}
      >
        <span className="shell-nav-icon">
          <Globe
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        </span>
        <span className="shell-nav-label truncate">{siteLabel}</span>
      </Link>
      {groups.map((group) => (
        <div key={group.label}>
          <GroupHeading label={group.label} expanded={expanded} />
          {group.modes.map((mode) => {
            const Icon = MARKETING_SEO_SECTION_ICONS[mode.slug];
            const isActive = active?.href === mode.href;
            return (
              <NavRow
                key={mode.href}
                href={mode.href}
                label={mode.name}
                title={mode.description}
                active={isActive}
                activeRef={
                  isActive
                    ? (el) => {
                        activeRef.current = el;
                      }
                    : undefined
                }
                icon={
                  <Icon
                    size={ROUTE_MENU_ICON_SIZE}
                    strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
                  />
                }
              />
            );
          })}
        </div>
      ))}
      <GroupHeading label="The Website" expanded={expanded} />
      <NavRow
        href={`/marketing/${brandSeg}/websites/${siteSeg}`}
        label="Website inventory"
        title="Pages, structure, sitemaps, media, crawls, and settings for this site."
        active={false}
        icon={
          <Globe
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        }
      />
    </>
  );
}

export default function MarketingSidebarMenu({
  expanded,
}: MarketingSidebarMenuProps) {
  const pathname = usePathname() ?? "/marketing";
  const context = resolveMarketingSidebarContext(pathname);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin-auto">
      {context.kind === "website" ? (
        <WebsiteMenu
          brandSeg={context.brandSeg}
          siteSeg={context.siteSeg}
          pathname={pathname}
          expanded={expanded}
          key={`w:${context.brandSeg}:${context.siteSeg}`}
        />
      ) : context.kind === "seo" ? (
        <SeoMenu
          brandSeg={context.brandSeg}
          siteSeg={context.siteSeg}
          pathname={pathname}
          expanded={expanded}
          key={`s:${context.brandSeg}:${context.siteSeg}`}
        />
      ) : context.kind === "brand" ? (
        <BrandMenu
          brandSeg={context.brandSeg}
          pathname={pathname}
          expanded={expanded}
          key={`b:${context.brandSeg}`}
        />
      ) : (
        <AgencyMenu pathname={pathname} expanded={expanded} />
      )}
    </div>
  );
}
