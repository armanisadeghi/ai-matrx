"use client";

/**
 * Administration route menu rendered inside the shared AppShell sidebar.
 * RouteMenuSlot owns switching, collapse behavior, mobile presentation, and
 * the reversible Main Menu control; this component only renders registry data.
 *
 * The tree is intentionally identical in both sidebar widths. Collapsing the
 * shell clips/fades labels through the shared CSS contract; it must never swap
 * the accordion tree for a second icon-only menu because doing so moves every
 * row and destroys the user's spatial map.
 */

import AppLink from "@/components/navigation/AppLink";
import { usePathname } from "next/navigation";
import { IconResolver } from "@ai-matrx/icons";
import { ADMIN_LAUNCHPAD_PATH } from "@/features/admin/constants/admin-categories";
import {
  adminDomainHref,
  adminNavigationRegistry,
  destinationOwnsPathname,
  findAdminNavigationDomainByPathname,
  findAdminNavigationLocation,
} from "@/features/admin/constants/admin-navigation";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import { cn } from "@/lib/utils";

interface AdminRouteSidebarMenuProps {
  expanded: boolean;
}

function AdminRouteIcon({ iconName }: { iconName: string }) {
  return (
    <IconResolver
      iconName={iconName}
      size={ROUTE_MENU_ICON_SIZE}
      style={{
        width: ROUTE_MENU_ICON_SIZE,
        height: ROUTE_MENU_ICON_SIZE,
        strokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
      }}
    />
  );
}

export default function AdminRouteSidebarMenu({
  expanded,
}: AdminRouteSidebarMenuProps) {
  const pathname = usePathname() ?? "/administration";
  const activeLocation = findAdminNavigationLocation(pathname);
  const activeDomain =
    activeLocation?.domain ?? findAdminNavigationDomainByPathname(pathname);

  return (
    <div
      className="shell-admin-route-menu"
      data-sidebar-expanded={expanded ? "true" : "false"}
    >
      <AppLink
        href="/administration"
        title="Administration"
        aria-label="Administration"
        aria-current={pathname === "/administration" ? "page" : undefined}
        className={cn(
          ROUTE_MENU_NAV_ITEM_CLASS,
          pathname === "/administration" && "shell-active-pill",
        )}
      >
        <span className="shell-nav-icon">
          <AdminRouteIcon iconName="ShieldCheck" />
        </span>
        <span className="shell-nav-label">Administration</span>
      </AppLink>

      <AppLink
        href={ADMIN_LAUNCHPAD_PATH}
        target="_blank"
        rel="noopener noreferrer"
        title="Launchpad"
        aria-label="Launchpad"
        aria-current={pathname === ADMIN_LAUNCHPAD_PATH ? "page" : undefined}
        className={cn(
          ROUTE_MENU_NAV_ITEM_CLASS,
          "border border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300",
          pathname === ADMIN_LAUNCHPAD_PATH && "shell-active-pill",
        )}
      >
        <span className="shell-nav-icon">
          <AdminRouteIcon iconName="Rocket" />
        </span>
        <span className="shell-nav-label">Launchpad</span>
        <span className="shell-nav-external">
          <IconResolver iconName="ArrowUpRight" className="h-3.5 w-3.5" />
        </span>
      </AppLink>

      <div className="shell-admin-domain-list">
        {adminNavigationRegistry
          .filter((domain) => domain.slug !== "launchpad")
          .map((domain) => {
            const domainActive = activeDomain?.name === domain.name;
            const domainLandingActive =
              pathname === adminDomainHref(domain) && !activeLocation;
            return (
              <details
                key={domain.name}
                className="shell-admin-domain"
                open={domainActive || undefined}
              >
                <summary
                  className={cn(
                    ROUTE_MENU_NAV_ITEM_CLASS,
                    "shell-admin-domain-trigger",
                    domainLandingActive && "shell-active-pill",
                  )}
                  title={domain.name}
                  aria-label={domain.name}
                >
                  <span className="shell-nav-icon">
                    <AdminRouteIcon iconName={domain.iconName} />
                  </span>
                  <span className="shell-nav-label shell-admin-domain-label">
                    {domain.name}
                  </span>
                  <span className="shell-admin-domain-caret" aria-hidden="true">
                    <IconResolver
                      iconName="ChevronDown"
                      className="h-3.5 w-3.5"
                    />
                  </span>
                </summary>

                <div className="shell-admin-domain-children">
                  {domain.sections.flatMap((section) =>
                    section.destinations.map((item) => {
                      const active = destinationOwnsPathname(item, pathname);
                      return (
                        <AppLink
                          key={item.link}
                          href={item.link}
                          title={item.title}
                          aria-label={item.title}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            ROUTE_MENU_NAV_ITEM_CLASS,
                            "shell-admin-destination",
                            active && "shell-active-pill",
                          )}
                        >
                          <span className="shell-nav-icon">
                            <AdminRouteIcon iconName={item.iconName} />
                          </span>
                          <span className="shell-nav-label">{item.title}</span>
                        </AppLink>
                      );
                    }),
                  )}
                </div>
              </details>
            );
          })}
      </div>
    </div>
  );
}
