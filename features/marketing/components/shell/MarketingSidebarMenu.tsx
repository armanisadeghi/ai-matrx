"use client";

/**
 * Marketing's route menu, rendered INSIDE the app shell sidebar in place of the
 * global nav (registered in `features/shell/constants/route-menu-registry.ts`).
 *
 * Why the sidebar and not the header: marketing is five levels deep — Marketing
 * → Brand → Site → Section → Sub-view — and a header can only ever show ONE of
 * them. A website's 26 sections could never fit across the top, so
 * `RouteModeNav` collapsed them to bare icons; and the moment you opened a site
 * the pillar nav disappeared entirely. A sidebar shows three levels at once.
 *
 * Two states, one component, both driven by the SAME declarations every other
 * marketing map reads — so this menu cannot drift from the hub, the landing, or
 * the global flyout:
 *   • outside a site → `MARKETING_PILLARS` (features/marketing/lib/marketing-nav.ts)
 *   • inside a site  → `listMarketingSiteModeGroups` (lib/route-sections.ts)
 *
 * `RouteMenuSlot` owns switching, collapse, the mobile presentation, and the
 * reversible Main Menu control. This component only renders registry data.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Globe, TrendingUp } from "lucide-react";

import IconResolver from "@/components/official/icons/IconResolver";
import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";
import { MARKETING_PILLARS } from "@/features/marketing/lib/marketing-nav";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { listMarketingSiteModeGroups } from "@/features/marketing/lib/route-sections";
import { MARKETING_SITE_SECTION_ICONS } from "@/features/marketing/lib/site-section-icons";
import { useSite } from "@/features/marketing/data/hooks";
import { cn } from "@/lib/utils";

const NAV_ITEM_CLASS = "shell-nav-item shell-nav-stable shell-tactile-subtle";
const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

/** `/marketing/brands/<brandId>/sites/<siteId>` and anything under it. */
const SITE_PATH_PATTERN =
  /^\/marketing\/brands\/([^/]+)\/sites\/([^/]+)(?:\/|$)/;

interface MarketingSidebarMenuProps {
  expanded: boolean;
}

/**
 * A group heading. Collapsed, the label would be unreadable at rail width, so
 * the grouping survives as a rule instead of vanishing — the rail keeps the
 * same rhythm as the expanded menu rather than becoming one long icon run.
 */
function GroupHeading({ label, expanded }: { label: string; expanded: boolean }) {
  if (!expanded) return <div className="mx-2 my-1 border-t border-border/70" />;
  return (
    <div className="px-1.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </div>
  );
}

/** The site's grouped sections, plus the doors back out to brand and portfolio. */
function SiteSections({
  brandId,
  siteId,
  pathname,
  expanded,
}: {
  brandId: string;
  siteId: string;
  pathname: string;
  expanded: boolean;
}) {
  // Shares React Query's cache with the site layout, which has already asked
  // for this row — the name costs no extra request.
  const site = useSite(siteId);
  const base = marketingRoutes.site(brandId, siteId);
  const groups = listMarketingSiteModeGroups(base);
  // One resolver for the whole flat list so a nested route (a page workspace, a
  // crawl detail) still lights up its parent section rather than nothing.
  const active = resolveActiveRouteMode(
    groups.flatMap((group) => group.modes),
    pathname,
  );

  return (
    <>
      <Link
        href={marketingRoutes.brand(brandId)}
        title="Back to brand"
        aria-label="Back to brand"
        className={NAV_ITEM_CLASS}
      >
        <span className="shell-nav-icon">
          <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </span>
        <span className="shell-nav-label truncate">Back to brand</span>
      </Link>

      <Link
        href={base}
        title={site.data?.name ?? "This website"}
        aria-label={site.data?.name ?? "This website"}
        className={cn(NAV_ITEM_CLASS, "font-medium")}
      >
        <span className="shell-nav-icon">
          <Globe size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </span>
        <span className="shell-nav-label truncate">
          {site.data?.name ?? "This website"}
        </span>
      </Link>

      {groups.map((group) => (
        <div key={group.label}>
          <GroupHeading label={group.label} expanded={expanded} />
          {group.modes.map((mode) => {
            const Icon = MARKETING_SITE_SECTION_ICONS[mode.slug];
            const isActive = active?.href === mode.href;
            return (
              <Link
                key={mode.href}
                href={mode.href}
                title={mode.name}
                aria-label={mode.name}
                aria-current={isActive ? "page" : undefined}
                className={cn(NAV_ITEM_CLASS, isActive && "shell-active-pill")}
              >
                <span className="shell-nav-icon">
                  <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                </span>
                <span className="shell-nav-label truncate">{mode.name}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** Every pillar's live surfaces — the same set the global flyout renders. */
function MarketingPillars({
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
          NAV_ITEM_CLASS,
          pathname === "/marketing" && "shell-active-pill",
        )}
      >
        <span className="shell-nav-icon">
          <TrendingUp size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </span>
        <span className="shell-nav-label truncate">Marketing Hub</span>
      </Link>

      {MARKETING_PILLARS.map((pillar) => {
        // Reserved surfaces are real routes, but they are promises rather than
        // destinations — the hub advertises them, the working menu does not.
        const entries = pillar.entries.filter(
          (entry) => entry.status !== "coming-soon" && !entry.navHidden,
        );
        if (entries.length === 0) return null;
        return (
          <div key={pillar.key}>
            <GroupHeading label={pillar.label} expanded={expanded} />
            {entries.map((entry) => {
              const isActive = pathname.startsWith(entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  title={entry.description}
                  aria-label={entry.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    NAV_ITEM_CLASS,
                    isActive && "shell-active-pill",
                  )}
                  {...(entry.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  <span className="shell-nav-icon">
                    <IconResolver
                      iconName={entry.iconName}
                      className="h-[18px] w-[18px]"
                    />
                  </span>
                  <span className="shell-nav-label truncate">
                    {entry.label}
                  </span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

export default function MarketingSidebarMenu({
  expanded,
}: MarketingSidebarMenuProps) {
  const pathname = usePathname() ?? "/marketing";
  const site = SITE_PATH_PATTERN.exec(pathname);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin-auto">
      {site ? (
        <SiteSections
          brandId={site[1]}
          siteId={site[2]}
          pathname={pathname}
          expanded={expanded}
          key={`${site[1]}:${site[2]}`}
        />
      ) : (
        <MarketingPillars pathname={pathname} expanded={expanded} />
      )}
    </div>
  );
}
